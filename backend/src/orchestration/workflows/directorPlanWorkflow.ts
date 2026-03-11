import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import { ConflictError, isWorkflowTerminatedError } from "../errors.js";
import { loadPrompt } from "../prompts/loadPrompt.js";
import { AgentRuntime } from "../runtime/AgentRuntime.js";
import { GenreConfigService } from "../../services/genreConfigService.js";
import { pipelineRealtimeService } from "../../services/pipelineRealtimeService.js";
import { workflowCacheService } from "../../services/workflowCacheService.js";
import { workflowControlService } from "../../services/workflowControlService.js";
import { Logger } from "../../utils/commonUtils.js";
import {
  scriptPackageSchema,
  type ScriptGenerationResult,
} from "./scriptGenerationWorkflow.js";

const MAX_SEGMENT_DURATION_SEC = 15;
const MAX_TOTAL_DURATION_SEC = 120;
const MIN_TOTAL_DURATION_SEC = 30;
const TARGET_AVERAGE_SEGMENT_DURATION_SEC = 12;
const ESTIMATED_WORDS_PER_SECOND = 2;
export const directorSegmentSchema = z.object({
  order: z.number().int().min(1),
  durationSec: z.number().int().positive().max(MAX_SEGMENT_DURATION_SEC),
  beat: z.string().trim().min(1),
  narration: z.string().trim().min(1),
  visualDirection: z.string().trim().min(1),
});

const directorPlanResponseSchema = z.object({
  breakdown: z.array(directorSegmentSchema).min(1),
  durationReason: z.string().trim().min(1),
});

const directorPlanPrompt = loadPrompt(
  "directorPlanPrompt.txt",
  import.meta.url,
);

export const directorPlanInputSchema = scriptPackageSchema.extend({
  genre: z.string().trim().min(1),
});

type DirectorPlanInput = z.infer<typeof directorPlanInputSchema>;
export type DirectorSegment = z.infer<typeof directorSegmentSchema>;

export type DirectorPlanResult = {
  totalDurationSec: number;
  breakdown: DirectorSegment[];
  durationReason: string;
};

type DirectorPlanningBudget = {
  storyWordCount: number;
  estimatedNarrationDurationSec: number;
  targetTotalDurationSec: number;
  suggestedMaxSegments: number;
  suggestedAverageSegmentDurationSec: number;
  requiresCompression: boolean;
};

type DirectorRetryGuidance = {
  previousTotalDurationSec: number;
  overBySec: number;
  requiredMaxTotalDurationSec: number;
};

const DirectorPlanState = Annotation.Root({
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
  durationReason: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  result: Annotation<DirectorPlanResult | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
});

type DirectorPlanStateType = typeof DirectorPlanState.State;

export class DirectorPlanWorkflow {
  private readonly graph;
  private readonly logger = new Logger("director-plan-workflow");

  constructor(
    private readonly agentRuntime = new AgentRuntime(),
    private readonly genreConfigService = new GenreConfigService(),
  ) {
    this.graph = this.buildGraph();
  }

  async run(input: DirectorPlanInput): Promise<DirectorPlanResult> {
    const cachedResult =
      await workflowCacheService.getCachedResult<DirectorPlanResult>(
        "directorPlan",
      );
    if (cachedResult) {
      pipelineRealtimeService.appendLog("loaded director plan from cache");
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
    });

    if (!finalState.result) {
      throw new Error("Director plan workflow did not produce a result");
    }

    await workflowCacheService.saveResult("directorPlan", finalState.result);
    return finalState.result;
  }

  private buildGraph() {
    return new StateGraph(DirectorPlanState)
      .addNode("loadContext", async (state) => this.loadContext(state))
      .addNode("createDirectorPlan", async (state) =>
        this.createDirectorPlan(state),
      )
      .addNode("formatResult", async (state) => this.formatResult(state))
      .addEdge(START, "loadContext")
      .addEdge("loadContext", "createDirectorPlan")
      .addEdge("createDirectorPlan", "formatResult")
      .addEdge("formatResult", END)
      .compile();
  }

  private async loadContext(
    state: DirectorPlanStateType,
  ): Promise<Partial<DirectorPlanStateType>> {
    workflowControlService.ensureNotTerminated();
    this.logger.info("Loading context", { genre: state.genre });
    const genre = state.genre.trim();
    if (!genre) {
      throw new ConflictError("Genre is required");
    }

    if (!state.scriptPackage) {
      throw new ConflictError("Script package is required");
    }

    const genrePool = await this.genreConfigService.getGenrePool();
    const configuredGenres = normalizeGenres(genrePool.selectedGenres);

    if (configuredGenres.length === 0) {
      this.logger.warn("No genres are configured in the database. Proceeding with unconfigured genre.");
    }

    if (!configuredGenres.includes(genre)) {
      this.logger.warn(`Genre "${genre}" is not in the configured list. Proceeding anyway per relaxed validation.`);
    }

    this.logger.info("Context loaded successfully");
    return {};
  }

  private async createDirectorPlan(
    state: DirectorPlanStateType,
  ): Promise<Partial<DirectorPlanStateType>> {
    workflowControlService.ensureNotTerminated();
    if (!state.scriptPackage) {
      throw new Error("Script package is missing");
    }

    this.logger.info("Creating director plan", {
      topic: state.scriptPackage.topic,
    });
    const signal = workflowControlService.getActiveSignal();
    const planningBudget = buildDirectorPlanningBudget(state.scriptPackage.story);

    let lastError: Error | undefined;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.info(`Director plan attempt ${attempt}/${maxAttempts}`);

        let response;
        try {
          const retryGuidance = lastError
            ? parseDirectorRetryGuidance(lastError.message)
            : undefined;
          response = await this.agentRuntime.invokeStructuredJson({
            roleKey: "director",
            systemPrompt: directorPlanPrompt,
            userPrompt: JSON.stringify(
              {
                genre: state.genre,
                scriptPackage: state.scriptPackage,
                constraints: {
                  maxSegmentDurationSec: MAX_SEGMENT_DURATION_SEC,
                  maxTotalDurationSec: MAX_TOTAL_DURATION_SEC,
                },
                planningBudget,
                instruction: buildDirectorInstruction(
                  planningBudget,
                  retryGuidance,
                ),
                ...(attempt > 1 && lastError
                  ? {
                      previousError: lastError.message,
                      retryGuidance,
                    }
                  : {}),
              },
              null,
              2,
            ),
            schema: directorPlanResponseSchema,
            ...(signal ? { signal } : {}),
          });
        } catch (invokeError: unknown) {
          // Convert Zod errors to more readable messages
          if (
            invokeError instanceof Error &&
            (invokeError.message.includes("invalid_type") ||
              invokeError.message.includes("Required"))
          ) {
            throw new Error(
              `Invalid segment data: Please ensure all segments have order, durationSec (number), beat, narration, and visualDirection fields. Check segment durations are numbers.`,
            );
          }
          throw invokeError;
        }

        const breakdown = validateDirectorBreakdown(response.breakdown);
        this.logger.info("Director plan created", {
          segmentCount: breakdown.length,
          durationReason: response.durationReason,
          attempt,
        });

        return {
          breakdown,
          durationReason: response.durationReason,
        };
      } catch (error) {
        if (isWorkflowTerminatedError(error)) throw error;
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Director plan attempt ${attempt} failed`, {
          error: lastError.message,
          attempt,
        });

        if (attempt === maxAttempts) {
          throw new Error(
            `Director plan failed after ${maxAttempts} attempts: ${lastError.message}`,
          );
        }

        // Wait briefly before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // This should never be reached
    throw new Error("Director plan failed unexpectedly");
  }

  private async formatResult(
    state: DirectorPlanStateType,
  ): Promise<Partial<DirectorPlanStateType>> {
    const totalDurationSec = roundDuration(
      state.breakdown.reduce(
        (total, segment) => total + segment.durationSec,
        0,
      ),
    );

    return {
      result: {
        totalDurationSec,
        breakdown: state.breakdown,
        durationReason: state.durationReason,
      },
    };
  }
}

function normalizeGenres(genres: string[]): string[] {
  return Array.from(
    new Set(genres.map((genre) => genre.trim()).filter(Boolean)),
  );
}

export function validateDirectorBreakdown(
  breakdown: DirectorSegment[],
): DirectorSegment[] {
  const sortedBreakdown = [...breakdown].sort(
    (left, right) => left.order - right.order,
  );

  sortedBreakdown.forEach((segment, index) => {
    if (segment.order !== index + 1) {
      throw new Error(
        "Director breakdown order must be sequential starting from 1",
      );
    }

    // Check if duration is an integer
    if (!Number.isInteger(segment.durationSec)) {
      throw new Error(
        `Director breakdown segment ${segment.order} duration must be an integer, got ${segment.durationSec}. Please use whole numbers (e.g., 10, 12, 15).`,
      );
    }

    if (segment.durationSec > MAX_SEGMENT_DURATION_SEC) {
      throw new Error(
        `Director breakdown segment ${segment.order} exceeds ${MAX_SEGMENT_DURATION_SEC} seconds`,
      );
    }
  });

  const totalDurationSec = roundDuration(
    sortedBreakdown.reduce((total, segment) => total + segment.durationSec, 0),
  );

  if (totalDurationSec > MAX_TOTAL_DURATION_SEC) {
    throw new Error(
      `Director breakdown exceeds ${MAX_TOTAL_DURATION_SEC} seconds (was ${totalDurationSec}s). The LLM must stay strictly within the 120-second limit. Please adjust segment durations or remove less critical segments.`,
    );
  }

  return sortedBreakdown.map((segment) => ({
    ...segment,
    durationSec: roundDuration(segment.durationSec),
  }));
}

function roundDuration(value: number): number {
  // Return integer duration - ensure whole number for video generation API
  return Math.round(value);
}

function buildDirectorPlanningBudget(story: string): DirectorPlanningBudget {
  const storyWordCount = countWords(story);
  const estimatedNarrationDurationSec = Math.max(
    MIN_TOTAL_DURATION_SEC,
    roundDuration(storyWordCount / ESTIMATED_WORDS_PER_SECOND),
  );
  const targetTotalDurationSec = Math.min(
    MAX_TOTAL_DURATION_SEC,
    estimatedNarrationDurationSec,
  );
  const suggestedMaxSegments = clamp(
    Math.ceil(targetTotalDurationSec / TARGET_AVERAGE_SEGMENT_DURATION_SEC),
    3,
    Math.ceil(MAX_TOTAL_DURATION_SEC / TARGET_AVERAGE_SEGMENT_DURATION_SEC),
  );
  const suggestedAverageSegmentDurationSec = clamp(
    Math.floor(targetTotalDurationSec / suggestedMaxSegments),
    6,
    MAX_SEGMENT_DURATION_SEC,
  );

  return {
    storyWordCount,
    estimatedNarrationDurationSec,
    targetTotalDurationSec,
    suggestedMaxSegments,
    suggestedAverageSegmentDurationSec,
    requiresCompression: estimatedNarrationDurationSec > MAX_TOTAL_DURATION_SEC,
  };
}

function buildDirectorInstruction(
  planningBudget: DirectorPlanningBudget,
  retryGuidance?: DirectorRetryGuidance,
): string {
  const baseInstruction = [
    `Plan for about ${planningBudget.targetTotalDurationSec} seconds total and never exceed ${MAX_TOTAL_DURATION_SEC} seconds.`,
    `Keep the breakdown at or below ${planningBudget.suggestedMaxSegments} segments with roughly ${planningBudget.suggestedAverageSegmentDurationSec}-${MAX_SEGMENT_DURATION_SEC} seconds per segment unless the story clearly needs fewer.`,
  ];

  if (planningBudget.requiresCompression) {
    baseInstruction.push(
      `The current script is estimated at ${planningBudget.estimatedNarrationDurationSec} seconds, so you must compress narration, merge adjacent beats, and drop lower-value transitions instead of preserving every sentence.`,
    );
  }

  if (retryGuidance) {
    baseInstruction.push(
      `Your previous plan totaled ${retryGuidance.previousTotalDurationSec} seconds, so reduce at least ${retryGuidance.overBySec} seconds before returning.`,
    );
  }

  baseInstruction.push(
    "Every segment must include order, durationSec, beat, narration, and visualDirection.",
  );

  return baseInstruction.join(" ");
}

function parseDirectorRetryGuidance(
  errorMessage: string,
): DirectorRetryGuidance | undefined {
  const durationOverflowMatch = errorMessage.match(
    /exceeds (\d+) seconds \(was (\d+)s\)/i,
  );
  if (!durationOverflowMatch) {
    return undefined;
  }

  const requiredMaxTotalDurationSec = Number(durationOverflowMatch[1]);
  const previousTotalDurationSec = Number(durationOverflowMatch[2]);
  if (
    !Number.isFinite(requiredMaxTotalDurationSec) ||
    !Number.isFinite(previousTotalDurationSec) ||
    previousTotalDurationSec <= requiredMaxTotalDurationSec
  ) {
    return undefined;
  }

  return {
    previousTotalDurationSec,
    overBySec: previousTotalDurationSec - requiredMaxTotalDurationSec,
    requiredMaxTotalDurationSec,
  };
}

function countWords(value: string): number {
  const tokens = value.trim().match(/\S+/g);
  return tokens ? tokens.length : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
