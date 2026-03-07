import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import { ConflictError } from "../errors.js";
import { loadPrompt } from "../prompts/loadPrompt.js";
import { AgentRuntime } from "../runtime/AgentRuntime.js";
import {
  AgentConfigService,
  type AgentConfigInput,
} from "../../services/agentConfigService.js";
import { GenreConfigService } from "../../services/genreConfigService.js";
import { pipelineRealtimeService } from "../../services/pipelineRealtimeService.js";
import { workflowCacheService } from "../../services/workflowCacheService.js";
import { workflowControlService } from "../../services/workflowControlService.js";
import { Logger } from "../../utils/commonUtils.js";
import {
  DashScopeVideoGenerationService,
  type GeneratedVideoArtifact,
} from "../tools/dashScopeVideoGenerationService.js";
import { FfmpegVideoStitchService } from "../tools/ffmpegVideoStitchService.js";
import {
  directorSegmentSchema,
  validateDirectorBreakdown,
  type DirectorSegment,
} from "./directorPlanWorkflow.js";
import {
  scriptPackageSchema,
  type ScriptGenerationResult,
} from "./scriptGenerationWorkflow.js";

const syncedSegmentSchema = z.object({
  order: z.number().int().min(1),
  durationSec: z.number().positive(),
  beat: z.string().trim().min(1),
  narration: z.string().trim().min(1),
  promptIntent: z.string().trim().min(1),
  continuityNotes: z.string().trim().min(1),
});

const syncedSegmentResponseSchema = z.object({
  syncedSegments: z.array(syncedSegmentSchema).min(1),
});

const generatedVideoSegmentSchema = z.object({
  order: z.number().int().min(1),
  durationSec: z.number().positive(),
  beat: z.string().trim().min(1),
  narration: z.string().trim().min(1),
  videoPrompt: z.string().trim().min(1),
  cameraDirection: z.string().trim().min(1),
  continuityNotes: z.string().trim().min(1),
});

const videoSyncPrompt = loadPrompt("videoSyncPrompt.txt", import.meta.url);

const cameramanVideoPrompt = loadPrompt("cameramanVideoPrompt.txt", import.meta.url);

export const videoGenerationInputSchema = scriptPackageSchema.extend({
  genre: z.string().trim().min(1),
  breakdown: z.array(directorSegmentSchema).min(1),
});

type VideoGenerationInput = z.infer<typeof videoGenerationInputSchema>;
type SyncedSegment = z.infer<typeof syncedSegmentSchema>;
type GeneratedVideoSegment = z.infer<typeof generatedVideoSegmentSchema>;
type RenderedVideoSegment = GeneratedVideoSegment & GeneratedVideoArtifact;

export type VideoGenerationResult = {
  totalDurationSec: number;
  tempDir: string;
  stitchedVideoPath: string;
  segments: RenderedVideoSegment[];
};

const VideoGenerationState = Annotation.Root({
  genre: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  scriptPackage: Annotation<ScriptGenerationResult | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  breakdown: Annotation<DirectorSegment[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  syncedSegments: Annotation<SyncedSegment[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  tempDir: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  segments: Annotation<RenderedVideoSegment[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  stitchedVideoPath: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  result: Annotation<VideoGenerationResult | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
});

type VideoGenerationStateType = typeof VideoGenerationState.State;

export class VideoGenerationWorkflow {
  private readonly graph;
  private readonly logger = new Logger("video-generation-workflow");

  constructor(
    private readonly agentRuntime = new AgentRuntime(),
    private readonly agentConfigService = new AgentConfigService(),
    private readonly videoGenerationService = new DashScopeVideoGenerationService(),
    private readonly ffmpegVideoStitchService = new FfmpegVideoStitchService(),
  ) {
    this.graph = this.buildGraph();
  }

  async run(input: VideoGenerationInput): Promise<VideoGenerationResult> {
    const cachedResult = await workflowCacheService.getCachedResult<VideoGenerationResult>("videoGeneration");
    if (cachedResult) {
      pipelineRealtimeService.appendLog("loaded video generation from cache");
      return cachedResult;
    }

    const finalState = await this.graph.invoke({
      genre: input.genre.trim(),
      scriptPackage: {
        topic: input.topic.trim(),
        title: input.title.trim(),
        description: input.description.trim(),
        story: input.story.trim(),
        summary: input.summary.trim(),
      },
      breakdown: validateDirectorBreakdown(input.breakdown),
    });

    if (!finalState.result) {
      throw new Error("Video generation workflow did not produce a result");
    }

    await workflowCacheService.saveResult("videoGeneration", finalState.result);
    return finalState.result;
  }

  private buildGraph() {
    return new StateGraph(VideoGenerationState)
      .addNode("loadContext", async (state) => this.loadContext(state))
      .addNode("createSyncedSegments", async (state) => this.createSyncedSegments(state))
      .addNode("createVideoSegments", async (state) => this.createVideoSegments(state))
      .addNode("stitchVideo", async (state) => this.stitchVideo(state))
      .addNode("formatResult", async (state) => this.formatResult(state))
      .addEdge(START, "loadContext")
      .addEdge("loadContext", "createSyncedSegments")
      .addEdge("createSyncedSegments", "createVideoSegments")
      .addEdge("createVideoSegments", "stitchVideo")
      .addEdge("stitchVideo", "formatResult")
      .addEdge("formatResult", END)
      .compile();
  }

  private async loadContext(
    state: VideoGenerationStateType,
  ): Promise<Partial<VideoGenerationStateType>> {
    workflowControlService.ensureNotTerminated();
    this.logger.info("Loading context", { genre: state.genre });
    const genre = state.genre.trim();
    if (!genre) {
      throw new ConflictError("Genre is required");
    }

    if (!state.scriptPackage) {
      throw new ConflictError("Script package is required");
    }

    if (state.breakdown.length === 0) {
      throw new ConflictError("Director breakdown is required");
    }

    const tempDir = await this.videoGenerationService.createOutputDirectory();
    workflowControlService.registerTempDir(tempDir);
    this.logger.info("Context loaded", { tempDir });

    return {
      tempDir,
    };
  }

  private async createSyncedSegments(
    state: VideoGenerationStateType,
  ): Promise<Partial<VideoGenerationStateType>> {
    const cachedResult = await workflowCacheService.getCachedResult<SyncedSegment[]>("videoSyncedSegments");
    if (cachedResult) {
      this.logger.info("Loaded synced segments from cache", { count: cachedResult.length });
      pipelineRealtimeService.appendLog("loaded director sync package from cache");
      return { syncedSegments: cachedResult };
    }

    workflowControlService.ensureNotTerminated();
    if (!state.scriptPackage) {
      throw new Error("Script package is missing");
    }

    this.logger.info("Creating synced segments", { segmentCount: state.breakdown.length });
    pipelineRealtimeService.appendLog("director sync package created");

    const signal = workflowControlService.getActiveSignal();
    const response = await this.agentRuntime.invokeStructuredJson({
      roleKey: "director",
      systemPrompt: videoSyncPrompt,
      userPrompt: JSON.stringify(
        {
          genre: state.genre,
          scriptPackage: state.scriptPackage,
          breakdown: state.breakdown,
        },
        null,
        2,
      ),
      schema: syncedSegmentResponseSchema,
      ...(signal ? { signal } : {}),
    });

    const result = validateSyncedSegments(state.breakdown, response.syncedSegments);
    this.logger.info("Synced segments created successfully", { count: result.length });
    await workflowCacheService.saveResult("videoSyncedSegments", result);
    return {
      syncedSegments: result,
    };
  }

  private async createVideoSegments(
    state: VideoGenerationStateType,
  ): Promise<Partial<VideoGenerationStateType>> {
    workflowControlService.ensureNotTerminated();
    if (!state.scriptPackage) {
      throw new Error("Script package is missing");
    }

    const cameramanConfig = await this.agentConfigService.getConfig("cameraman");
    if (!cameramanConfig) {
      throw new ConflictError('Model config for role "cameraman" is not configured');
    }

    const videoGenConfig = await this.agentConfigService.getConfig("video-gen");
    if (!videoGenConfig) {
      throw new ConflictError('Model config for role "video-gen" is not configured');
    }

    if (!state.tempDir) {
      throw new Error("Temporary output directory is missing");
    }

    const segments: RenderedVideoSegment[] = new Array(state.syncedSegments.length);
    this.logger.info("cameraman handles text planning, video-gen handles clip generation");
    pipelineRealtimeService.appendLog("using video-gen model for clips, cameraman for segment planning");

    const PARALLEL_BATCH_SIZE = 2;
    this.logger.info("Starting video segment generation", { 
      totalSegments: state.syncedSegments.length, 
      batchSize: PARALLEL_BATCH_SIZE 
    });

    for (let batchStart = 0; batchStart < state.syncedSegments.length; batchStart += PARALLEL_BATCH_SIZE) {
      workflowControlService.ensureNotTerminated();
      const batch = state.syncedSegments.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE);
      this.logger.info(`Processing batch starting at ${batchStart}`, { batchSize: batch.length });

      const batchResults = await Promise.all(
        batch.map(async (syncedSegment) => {
          const fileNameStem = buildSegmentFileName(syncedSegment.order, syncedSegment.beat);
          const cachedSegment = await workflowCacheService.getCachedResult<RenderedVideoSegment>(fileNameStem);
          if (cachedSegment) {
            this.logger.info(`Loaded segment ${syncedSegment.order} from cache`);
            pipelineRealtimeService.appendLog(`loaded segment ${syncedSegment.order} from cache`);
            return cachedSegment;
          }

          this.logger.info(`Generating segment ${syncedSegment.order}`, { beat: syncedSegment.beat });
          pipelineRealtimeService.appendLog(
            `generating segment ${syncedSegment.order}: ${syncedSegment.beat.toLowerCase()}`,
          );
          const signal = workflowControlService.getActiveSignal();
          const segmentPlan = await this.agentRuntime.invokeStructuredJson({
            roleKey: "cameraman",
            systemPrompt: cameramanVideoPrompt,
            userPrompt: JSON.stringify(
              {
                genre: state.genre,
                scriptPackage: state.scriptPackage,
                breakdown: state.breakdown,
                currentSegment: syncedSegment,
              },
              null,
              2,
            ),
            schema: generatedVideoSegmentSchema,
            ...(signal ? { signal } : {}),
          });

          const validatedSegmentPlan = validateGeneratedVideoSegment(syncedSegment, segmentPlan);

          this.logger.info(`Rendering clip for segment ${syncedSegment.order}`, { 
            videoPrompt: validatedSegmentPlan.videoPrompt.substring(0, 100) + "..." 
          });

          let artifact: GeneratedVideoArtifact;
          try {
            artifact = await this.videoGenerationService.generateVideoClip({
              config: videoGenConfig,
              prompt: validatedSegmentPlan.videoPrompt,
              durationSec: validatedSegmentPlan.durationSec,
              outputDir: state.tempDir!,
              fileNameStem,
              ...(signal ? { signal } : {}),
            });
          } catch (err) {
            const isInappropriate = err instanceof Error && err.message.toLowerCase().includes("inappropriate");
            if (!isInappropriate) throw err;

            this.logger.warn(`Segment ${syncedSegment.order} rejected for inappropriate content, sanitizing and retrying`);
            pipelineRealtimeService.appendLog(`segment ${syncedSegment.order}: content rejected, sanitizing prompt and retrying`);

            const sanitizedPrompt = this.sanitizeVideoPrompt(
              validatedSegmentPlan.videoPrompt,
              syncedSegment.order,
            );
            artifact = await this.videoGenerationService.generateVideoClip({
              config: videoGenConfig,
              prompt: sanitizedPrompt,
              durationSec: validatedSegmentPlan.durationSec,
              outputDir: state.tempDir!,
              fileNameStem,
              ...(signal ? { signal } : {}),
            });
            validatedSegmentPlan.videoPrompt = sanitizedPrompt;
          }

          const finalSegment = {
            ...validatedSegmentPlan,
            ...artifact,
          };
          await workflowCacheService.saveResult(fileNameStem, finalSegment);
          this.logger.info(`Segment ${validatedSegmentPlan.order} rendered successfully`);
          pipelineRealtimeService.appendLog(`segment ${validatedSegmentPlan.order} rendered`);
          return finalSegment;
        }),
      );

      batchResults.forEach((segment, index) => {
        segments[batchStart + index] = segment;
      });
    }

    return {
      segments,
    };
  }

  private sanitizeVideoPrompt(
    rawPrompt: string,
    segmentOrder: number,
  ): string {
    this.logger.info(`Sanitizing video prompt for segment ${segmentOrder} (word replacement)`);
    const sanitized = applyForbiddenWordReplacements(rawPrompt);
    this.logger.info(`Segment ${segmentOrder} prompt sanitized successfully`);
    return sanitized;
  }

  private async stitchVideo(
    state: VideoGenerationStateType,
  ): Promise<Partial<VideoGenerationStateType>> {
    workflowControlService.ensureNotTerminated();
    if (!state.tempDir) {
      throw new Error("Temporary output directory is missing");
    }

    this.logger.info("Stitching video segments", { segmentCount: state.segments.length });
    pipelineRealtimeService.appendLog("stitching final video");
    const stitchedVideoPath = await this.ffmpegVideoStitchService.stitchVideos({
      outputDir: state.tempDir,
      segmentPaths: state.segments.map((segment) => segment.localPath),
    });

    this.logger.info("Video stitched successfully", { stitchedVideoPath });
    return {
      stitchedVideoPath,
    };
  }

  private async formatResult(
    state: VideoGenerationStateType,
  ): Promise<Partial<VideoGenerationStateType>> {
    if (!state.stitchedVideoPath) {
      throw new Error("Stitched video path is missing");
    }

    return {
      result: {
        totalDurationSec: roundDuration(
          state.segments.reduce((total, segment) => total + segment.durationSec, 0),
        ),
        tempDir: state.tempDir,
        stitchedVideoPath: state.stitchedVideoPath,
        segments: state.segments,
      },
    };
  }
}

function resolveSegmentPlanningRole(cameramanConfig: AgentConfigInput): string {
  if (isVideoOnlyModel(cameramanConfig) || isVideoOnlyEndpoint(cameramanConfig.apiUrl)) {
    return "director";
  }

  return "cameraman";
}

function isVideoOnlyModel(config: AgentConfigInput): boolean {
  return config.modelName.trim().toLowerCase().startsWith("wan");
}

function isVideoOnlyEndpoint(apiUrl: string): boolean {
  try {
    const pathname = new URL(apiUrl).pathname.replace(/\/$/, "").toLowerCase();
    return pathname.endsWith("/services/aigc/video-generation/video-synthesis");
  } catch {
    return false;
  }
}

function validateSyncedSegments(
  breakdown: DirectorSegment[],
  syncedSegments: SyncedSegment[],
): SyncedSegment[] {
  if (syncedSegments.length !== breakdown.length) {
    throw new Error("Synced segment count must exactly match the director breakdown");
  }

  return breakdown.map((segment, index) => {
    const syncedSegment = syncedSegments[index];
    if (!syncedSegment) {
      throw new Error(`Synced segment ${segment.order} is missing`);
    }

    if (syncedSegment.order !== segment.order) {
      throw new Error("Synced segment order must exactly match the director breakdown");
    }

    if (roundDuration(syncedSegment.durationSec) !== roundDuration(segment.durationSec)) {
      throw new Error("Synced segment duration must exactly match the director breakdown");
    }

    if (syncedSegment.beat.trim() !== segment.beat.trim()) {
      throw new Error("Synced segment beat must exactly match the director breakdown");
    }

    return {
      ...syncedSegment,
      durationSec: roundDuration(syncedSegment.durationSec),
    };
  });
}

function validateGeneratedVideoSegment(
  syncedSegment: SyncedSegment,
  segment: GeneratedVideoSegment,
): GeneratedVideoSegment {
  if (segment.order !== syncedSegment.order) {
    throw new Error("Generated video segment order must exactly match the synced segment package");
  }

  if (segment.beat.trim() !== syncedSegment.beat.trim()) {
    throw new Error("Generated video segment beat must exactly match the synced segment package");
  }

  // Always use the authoritative duration from the synced package — do not trust the LLM's value.
  return {
    ...segment,
    durationSec: roundDuration(syncedSegment.durationSec),
  };
}

function roundDuration(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildSegmentFileName(order: number, beat: string): string {
  return `${String(order).padStart(2, "0")}-${slugify(beat)}`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const FORBIDDEN_WORD_REPLACEMENTS: [RegExp, string][] = [
  [/\bwar\b/gi, "major dispute"],
  [/\bconflict\b/gi, "disagreement"],
  [/\bbattle\b/gi, "standoff"],
  [/\btension\b/gi, "unease"],
  [/\bclash\b/gi, "disagreement"],
  [/\bstrike\b/gi, "action"],
  [/\battack(s|ed|ing)?\b/gi, "incident"],
  [/\bdefense\b/gi, "preparedness"],
  [/\bmilitary\b/gi, "governmental"],
  [/\bcombat\b/gi, "confrontation"],
  [/\bweapon(s|ry)?\b/gi, "equipment"],
  [/\bmissile(s)?\b/gi, "projectile"],
  [/\bgun(s|fire)?\b/gi, "device"],
  [/\bbomb(s|ing|ed)?\b/gi, "device"],
  [/\bexplosion(s)?\b/gi, "burst"],
  [/\bblood\b/gi, "hardship"],
  [/\bviolence\b/gi, "upheaval"],
  [/\bscared\b/gi, "unsettled"],
  [/\bterrified\b/gi, "unsettled"],
  [/\bpanic\b/gi, "urgency"],
  [/\bdesperate\b/gi, "determined"],
  [/\bflee(s|ing)?\b/gi, "move away"],
  [/\bescape(s|d|ing)?\b/gi, "depart"],
  [/\bfear(s|ful)?\b/gi, "concern"],
  [/\banger\b/gi, "intensity"],
  [/\bdanger(ous)?\b/gi, "uncertainty"],
  [/\bhazard(ous)?\b/gi, "challenge"],
  [/\bthreat(s|ening)?\b/gi, "pressure"],
  [/\bprotest(s|ers|ing)?\b/gi, "gathering"],
  [/\briot(s|ing)?\b/gi, "commotion"],
  [/\buprising\b/gi, "movement"],
  [/\brevolution\b/gi, "change"],
  [/\bcoup\b/gi, "transition"],
  [/\bsanction(s|ed)?\b/gi, "restriction"],
  [/\bembargo\b/gi, "restriction"],
  [/\bsuppression\b/gi, "limitation"],
  [/\bDeclaration of Independence\b/gi, "an aged parchment document"],
  [/\bBill of Rights\b/gi, "an aged parchment document"],
  [/\bMagna Carta\b/gi, "an aged parchment document"],
  [/\bTreaty of Versailles\b/gi, "an aged parchment document"],
];

function applyForbiddenWordReplacements(prompt: string): string {
  let result = prompt;
  for (const [pattern, replacement] of FORBIDDEN_WORD_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
