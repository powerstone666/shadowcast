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
export const directorSegmentSchema = z.object({
  order: z.number().int().min(1),
  durationSec: z.number().positive().max(MAX_SEGMENT_DURATION_SEC),
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
      throw new ConflictError("No genres are configured");
    }

    if (!configuredGenres.includes(genre)) {
      throw new ConflictError(`Genre "${genre}" is not configured`);
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

    let lastError: Error | undefined;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.info(`Director plan attempt ${attempt}/${maxAttempts}`);

        let response;
        try {
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
                ...(attempt > 1 && lastError
                  ? {
                      previousError: lastError.message,
                      instruction:
                        "Please ensure all segments have durationSec field and total duration does not exceed 120 seconds. Each segment must have order, durationSec, beat, narration, and visualDirection.",
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
      `Director breakdown exceeds ${MAX_TOTAL_DURATION_SEC} seconds in total duration`,
    );
  }

  return sortedBreakdown.map((segment) => ({
    ...segment,
    durationSec: roundDuration(segment.durationSec),
  }));
}

function roundDuration(value: number): number {
  return Math.round(value * 100) / 100;
}
