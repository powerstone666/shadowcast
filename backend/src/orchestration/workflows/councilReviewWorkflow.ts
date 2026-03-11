import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import { ConflictError } from "../errors.js";
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

const PASS_THRESHOLD = 7;
const COUNCIL_MEMBERS = [
  {
    roleKey: "research-expert",
    reviewer: "Narrative & Entertainment Expert",
    focus: "storytelling flow, narrative structure, entertainment value, and maintaining high viewer engagement",
  },
  {
    roleKey: "strategy-expert",
    reviewer: "Strategy Expert",
    focus: "click potential, title strength, positioning, audience appeal, and retention potential",
  },
  {
    roleKey: "quality-expert",
    reviewer: "Quality Expert",
    focus: "clarity, structure, coherence, pacing, and overall viewer experience",
  },
] as const;

const councilReviewResponseSchema = z.object({
  criterionScores: z.object({
    hookStrength: z.number().min(0).max(2),
    genreStorytellingMode: z.number().min(0).max(2),
    pacingNarrativeFlow: z.number().min(0).max(2),
    midVideoRetention: z.number().min(0).max(2),
    conclusionQuality: z.number().min(0).max(2),
  }),
  reason: z.string().trim().min(1),
  points: z.array(z.string().trim().min(1)).min(3),
});

const councilReviewPrompt = loadPrompt("councilReviewPrompt.txt", import.meta.url);

const scriptRevisionPrompt = loadPrompt("scriptRevisionPrompt.txt", import.meta.url);

export const councilReviewInputSchema = scriptPackageSchema.extend({
  genre: z.string().trim().min(1),
});

type CouncilReviewInput = z.infer<typeof councilReviewInputSchema>;
type CouncilMember = (typeof COUNCIL_MEMBERS)[number];

export type CouncilReview = {
  roleKey: CouncilMember["roleKey"];
  reviewer: CouncilMember["reviewer"];
  focus: CouncilMember["focus"];
  score: number;
  criterionScores: {
    hookStrength: number;
    genreStorytellingMode: number;
    pacingNarrativeFlow: number;
    midVideoRetention: number;
    conclusionQuality: number;
  };
  reason: string;
  points: string[];
};

export type CouncilReviewResult = {
  passed: boolean;
  averageScore: number;
  threshold: number;
  revised: boolean;
  reviews: CouncilReview[];
  scriptPackage: ScriptGenerationResult;
};

const CouncilReviewState = Annotation.Root({
  genre: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  scriptPackage: Annotation<ScriptGenerationResult | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  reviews: Annotation<CouncilReview[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  averageScore: Annotation<number>({
    reducer: (_, right) => right,
    default: () => 0,
  }),
  passed: Annotation<boolean>({
    reducer: (_, right) => right,
    default: () => false,
  }),
  finalScriptPackage: Annotation<ScriptGenerationResult | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  result: Annotation<CouncilReviewResult | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
});

type CouncilReviewStateType = typeof CouncilReviewState.State;

export class CouncilReviewWorkflow {
  private readonly graph;
  private readonly logger = new Logger("council-review-workflow");

  constructor(
    private readonly agentRuntime = new AgentRuntime(),
    private readonly genreConfigService = new GenreConfigService(),
  ) {
    this.graph = this.buildGraph();
  }

  async run(input: CouncilReviewInput): Promise<CouncilReviewResult> {
    const cachedResult = await workflowCacheService.getCachedResult<CouncilReviewResult>("councilReview");
    if (cachedResult) {
      pipelineRealtimeService.appendLog("loaded council review from cache");
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
      throw new Error("Council review workflow did not produce a result");
    }

    await workflowCacheService.saveResult("councilReview", finalState.result);
    return finalState.result;
  }

  private buildGraph() {
    return new StateGraph(CouncilReviewState)
      .addNode("loadContext", async (state) => this.loadContext(state))
      .addNode("reviewByCouncil", async (state) => this.reviewByCouncil(state))
      .addNode("reviseScriptIfNeeded", async (state) => this.reviseScriptIfNeeded(state))
      .addNode("formatResult", async (state) => this.formatResult(state))
      .addEdge(START, "loadContext")
      .addEdge("loadContext", "reviewByCouncil")
      .addEdge("reviewByCouncil", "reviseScriptIfNeeded")
      .addEdge("reviseScriptIfNeeded", "formatResult")
      .addEdge("formatResult", END)
      .compile();
  }

  private async loadContext(
    state: CouncilReviewStateType,
  ): Promise<Partial<CouncilReviewStateType>> {
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

  private async reviewByCouncil(
    state: CouncilReviewStateType,
  ): Promise<Partial<CouncilReviewStateType>> {
    workflowControlService.ensureNotTerminated();
    if (!state.scriptPackage) {
      throw new Error("Script package is missing");
    }

    this.logger.info("Starting council review", { 
      topic: state.scriptPackage.topic, 
      memberCount: COUNCIL_MEMBERS.length 
    });

    const reviews = await Promise.all(
      COUNCIL_MEMBERS.map(async (member) => {
        workflowControlService.ensureNotTerminated();
        this.logger.info(`Reviewing: ${member.reviewer}`, { focus: member.focus });
        const signal = workflowControlService.getActiveSignal();
        const review = await this.agentRuntime.invokeStructuredJson({
          roleKey: member.roleKey,
          systemPrompt: councilReviewPrompt,
          userPrompt: JSON.stringify(
            {
              reviewer: member.reviewer,
              focus: member.focus,
              genre: state.genre,
              scriptPackage: state.scriptPackage,
            },
            null,
            2,
          ),
          schema: councilReviewResponseSchema,
          ...(signal ? { signal } : {}),
        });

        const finalizedReview = {
          roleKey: member.roleKey,
          reviewer: member.reviewer,
          focus: member.focus,
          criterionScores: normalizeCriterionScores(review.criterionScores),
          score: calculateCouncilScore(review.criterionScores),
          reason: review.reason,
          points: normalizePoints(review.points),
        };
        this.logger.info(`Score from ${member.reviewer}: ${finalizedReview.score}`);
        return finalizedReview;
      }),
    );

    const averageScore = roundScore(
      reviews.reduce((total, review) => total + review.score, 0) / reviews.length,
    );

    this.logger.info("Council review completed", { 
      averageScore, 
      passed: averageScore >= PASS_THRESHOLD 
    });

    return {
      reviews,
      averageScore,
      passed: averageScore >= PASS_THRESHOLD,
    };
  }

  private async reviseScriptIfNeeded(
    state: CouncilReviewStateType,
  ): Promise<Partial<CouncilReviewStateType>> {
    workflowControlService.ensureNotTerminated();
    if (!state.scriptPackage) {
      throw new Error("Script package is missing");
    }

    if (state.passed) {
      this.logger.info("Script passed review, skipping revision");
      return {
        finalScriptPackage: state.scriptPackage,
      };
    }

    this.logger.info("Script failed review, initiating revision", { 
      averageScore: state.averageScore, 
      threshold: PASS_THRESHOLD 
    });

    const signal = workflowControlService.getActiveSignal();
    const revisedScriptPackage = await this.agentRuntime.invokeStructuredJson({
      roleKey: "script-writer",
      systemPrompt: scriptRevisionPrompt,
      userPrompt: JSON.stringify(
        {
          genre: state.genre,
          averageScore: state.averageScore,
          threshold: PASS_THRESHOLD,
          currentScriptPackage: state.scriptPackage,
          councilReviews: state.reviews,
        },
        null,
        2,
      ),
      schema: scriptPackageSchema,
      ...(signal ? { signal } : {}),
    });

    this.logger.info("Script revision completed", { 
      newTitle: revisedScriptPackage.title,
      storyLength: revisedScriptPackage.story.length
    });

    return {
      finalScriptPackage: revisedScriptPackage,
    };
  }

  private async formatResult(
    state: CouncilReviewStateType,
  ): Promise<Partial<CouncilReviewStateType>> {
    if (!state.finalScriptPackage) {
      throw new Error("Final script package is missing");
    }

    return {
      result: {
        passed: state.passed,
        averageScore: state.averageScore,
        threshold: PASS_THRESHOLD,
        revised: !state.passed,
        reviews: state.reviews,
        scriptPackage: state.finalScriptPackage,
      },
    };
  }
}

function normalizeGenres(genres: string[]): string[] {
  return Array.from(new Set(genres.map((genre) => genre.trim()).filter(Boolean)));
}

function normalizePoints(points: string[]): string[] {
  const normalizedPoints = Array.from(
    new Set(points.map((point) => point.trim()).filter(Boolean)),
  );

  if (normalizedPoints.length < 3) {
    throw new Error("Council review must include at least three unique feedback points");
  }

  return normalizedPoints;
}

function normalizeCriterionScores(scores: {
  hookStrength: number;
  genreStorytellingMode: number;
  pacingNarrativeFlow: number;
  midVideoRetention: number;
  conclusionQuality: number;
}): CouncilReview["criterionScores"] {
  return {
    hookStrength: roundCriterionScore(scores.hookStrength),
    genreStorytellingMode: roundCriterionScore(scores.genreStorytellingMode),
    pacingNarrativeFlow: roundCriterionScore(scores.pacingNarrativeFlow),
    midVideoRetention: roundCriterionScore(scores.midVideoRetention),
    conclusionQuality: roundCriterionScore(scores.conclusionQuality),
  };
}

function calculateCouncilScore(scores: {
  hookStrength: number;
  genreStorytellingMode: number;
  pacingNarrativeFlow: number;
  midVideoRetention: number;
  conclusionQuality: number;
}): number {
  const normalizedScores = normalizeCriterionScores(scores);
  const total =
    normalizedScores.hookStrength +
    normalizedScores.genreStorytellingMode +
    normalizedScores.pacingNarrativeFlow +
    normalizedScores.midVideoRetention +
    normalizedScores.conclusionQuality;

  return roundScore(total);
}

function roundCriterionScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
