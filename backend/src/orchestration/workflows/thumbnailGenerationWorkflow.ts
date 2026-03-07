import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import { ConflictError } from "../errors.js";
import { AgentConfigService } from "../../services/agentConfigService.js";
import { pipelineRealtimeService } from "../../services/pipelineRealtimeService.js";
import { workflowCacheService } from "../../services/workflowCacheService.js";
import { workflowControlService } from "../../services/workflowControlService.js";
import { Logger } from "../../utils/commonUtils.js";
import {
  DashScopeImageGenerationService,
  type GeneratedImageArtifact,
} from "../tools/dashScopeImageGenerationService.js";

export const thumbnailGenerationInputSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

type ThumbnailGenerationInput = z.infer<typeof thumbnailGenerationInputSchema>;

export type ThumbnailGenerationResult = GeneratedImageArtifact & {
  tempDir: string;
  prompt: string;
};

const ThumbnailGenerationState = Annotation.Root({
  title: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  summary: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  tempDir: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  prompt: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  artifact: Annotation<GeneratedImageArtifact | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  result: Annotation<ThumbnailGenerationResult | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
});

type ThumbnailGenerationStateType = typeof ThumbnailGenerationState.State;

export class ThumbnailGenerationWorkflow {
  private readonly graph;
  private readonly logger = new Logger("thumbnail-generation-workflow");

  constructor(
    private readonly agentConfigService = new AgentConfigService(),
    private readonly imageGenerationService = new DashScopeImageGenerationService(),
  ) {
    this.graph = this.buildGraph();
  }

  async run(input: ThumbnailGenerationInput): Promise<ThumbnailGenerationResult> {
    const cachedResult = await workflowCacheService.getCachedResult<ThumbnailGenerationResult>("thumbnailGeneration");
    if (cachedResult) {
      pipelineRealtimeService.appendLog("loaded thumbnail generation from cache");
      return cachedResult;
    }

    const finalState = await this.graph.invoke({
      title: input.title.trim(),
      summary: input.summary.trim(),
    });

    if (!finalState.result) {
      throw new Error("Thumbnail generation workflow did not produce a result");
    }

    await workflowCacheService.saveResult("thumbnailGeneration", finalState.result);
    return finalState.result;
  }

  private buildGraph() {
    return new StateGraph(ThumbnailGenerationState)
      .addNode("loadContext", async (state) => this.loadContext(state))
      .addNode("buildPrompt", async (state) => this.buildPrompt(state))
      .addNode("generateThumbnail", async (state) => this.generateThumbnail(state))
      .addNode("formatResult", async (state) => this.formatResult(state))
      .addEdge(START, "loadContext")
      .addEdge("loadContext", "buildPrompt")
      .addEdge("buildPrompt", "generateThumbnail")
      .addEdge("generateThumbnail", "formatResult")
      .addEdge("formatResult", END)
      .compile();
  }

  private async loadContext(
    state: ThumbnailGenerationStateType,
  ): Promise<Partial<ThumbnailGenerationStateType>> {
    workflowControlService.ensureNotTerminated();
    this.logger.info("Loading context", { title: state.title });
    if (!state.title.trim()) {
      throw new ConflictError("Title is required");
    }

    if (!state.summary.trim()) {
      throw new ConflictError("Summary is required");
    }

    const thumbnailConfig = await this.agentConfigService.getConfig("thumbnail-gen");
    if (!thumbnailConfig) {
      throw new ConflictError('Model config for role "thumbnail-gen" is not configured');
    }

    const tempDir = await this.imageGenerationService.createOutputDirectory();
    workflowControlService.registerTempDir(tempDir);
    this.logger.info("Context loaded", { tempDir });

    return {
      tempDir,
    };
  }

  private async buildPrompt(
    state: ThumbnailGenerationStateType,
  ): Promise<Partial<ThumbnailGenerationStateType>> {
    workflowControlService.ensureNotTerminated();
    const prompt = buildThumbnailPrompt({
      title: state.title,
      summary: state.summary,
    });
    this.logger.info("Built thumbnail prompt", { prompt });
    return {
      prompt,
    };
  }

  private async generateThumbnail(
    state: ThumbnailGenerationStateType,
  ): Promise<Partial<ThumbnailGenerationStateType>> {
    workflowControlService.ensureNotTerminated();
    const thumbnailConfig = await this.agentConfigService.getConfig("thumbnail-gen");
    if (!thumbnailConfig) {
      throw new ConflictError('Model config for role "thumbnail-gen" is not configured');
    }

    if (!state.tempDir) {
      throw new Error("Temporary output directory is missing");
    }

    this.logger.info("Generating thumbnail image");
    const signal = workflowControlService.getActiveSignal();
    const artifact = await this.imageGenerationService.generateThumbnail({
      config: thumbnailConfig,
      prompt: state.prompt,
      outputDir: state.tempDir,
      fileNameStem: "thumbnail",
      ...(signal ? { signal } : {}),
    });

    this.logger.info("Thumbnail image generated successfully");
    return {
      artifact,
    };
  }

  private async formatResult(
    state: ThumbnailGenerationStateType,
  ): Promise<Partial<ThumbnailGenerationStateType>> {
    if (!state.artifact) {
      throw new Error("Thumbnail artifact is missing");
    }

    return {
      result: {
        tempDir: state.tempDir,
        prompt: state.prompt,
        ...state.artifact,
      },
    };
  }
}

function buildThumbnailPrompt(input: { title: string; summary: string }): string {
  return [
    "Create a cinematic YouTube thumbnail with a strong focal subject and high visual contrast.",
    `Video title: ${input.title}`,
    `Story summary: ${input.summary}`,
    "Requirements: dramatic composition, expressive subject, bold lighting, clean background separation, no text overlay, thumbnail-safe framing, 16:9 composition.",
  ].join(" ");
}
