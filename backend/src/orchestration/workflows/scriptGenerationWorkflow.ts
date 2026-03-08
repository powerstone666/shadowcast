import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import { ConflictError } from "../errors.js";
import { loadPrompt } from "../prompts/loadPrompt.js";
import { AgentRuntime } from "../runtime/AgentRuntime.js";
import { getNativeSearchExtraBody } from "../runtime/nativeSearchSupport.js";
import {
  TavilySearchService,
  type SearchResult,
} from "../tools/tavilySearchService.js";
import {
  ContentMemoryService,
  type RecentContentItem,
} from "../../services/contentMemoryService.js";
import { GenreConfigService } from "../../services/genreConfigService.js";
import { pipelineRealtimeService } from "../../services/pipelineRealtimeService.js";
import { workflowCacheService } from "../../services/workflowCacheService.js";
import { workflowControlService } from "../../services/workflowControlService.js";
import { Logger } from "../../utils/commonUtils.js";

const RECENT_HISTORY_DAYS = 14;

const scriptResearchQueryResponseSchema = z.object({
  queries: z.array(z.string().trim().min(1)).length(3),
});

const nativeResearchBundleSchema = z.object({
  query: z.string().trim().min(1),
  results: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        url: z.string().trim().min(1),
        snippet: z.string(),
      }),
    )
    .min(1),
});

const scriptNativeResearchResponseSchema = z.object({
  researchBundles: z.array(nativeResearchBundleSchema).length(3),
});

export const scriptPackageSchema = z.object({
  topic: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  story: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

const scriptResearchQueryPrompt = loadPrompt("scriptResearchQueryPrompt.txt", import.meta.url);
const scriptNativeResearchPrompt = loadPrompt("scriptNativeResearchPrompt.txt", import.meta.url);

const scriptGenerationPrompt = loadPrompt("scriptGenerationPrompt.txt", import.meta.url);

type ResearchBundle = {
  query: string;
  results: SearchResult[];
};

export type ScriptGenerationResult = z.infer<typeof scriptPackageSchema>;

type WorkflowInput = {
  genre: string;
  topic: string;
  title: string;
  userPreference?: string | undefined;
};

const ScriptGenerationState = Annotation.Root({
  genre: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  topic: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  title: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  userPreference: Annotation<string | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  configuredGenres: Annotation<string[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  recentContent: Annotation<RecentContentItem[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  researchQueries: Annotation<string[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  researchBundles: Annotation<ResearchBundle[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  result: Annotation<ScriptGenerationResult | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
});

type ScriptGenerationStateType = typeof ScriptGenerationState.State;

export class ScriptGenerationWorkflow {
  private readonly graph;
  private readonly logger = new Logger("script-generation-workflow");

  constructor(
    private readonly agentRuntime = new AgentRuntime(),
    private readonly genreConfigService = new GenreConfigService(),
    private readonly contentMemoryService = new ContentMemoryService(),
    private readonly searchService = new TavilySearchService(),
  ) {
    this.graph = this.buildGraph();
  }

  async run(input: WorkflowInput): Promise<ScriptGenerationResult> {
    const cachedResult = await workflowCacheService.getCachedResult<ScriptGenerationResult>("scriptGeneration");
    if (cachedResult) {
      pipelineRealtimeService.appendLog("loaded script generation from cache");
      return cachedResult;
    }

    const finalState = await this.graph.invoke({
      genre: input.genre.trim(),
      topic: input.topic.trim(),
      title: input.title.trim(),
      userPreference: input.userPreference,
    });

    if (!finalState.result) {
      throw new Error("Script generation workflow did not produce a result");
    }

    await workflowCacheService.saveResult("scriptGeneration", finalState.result);
    return finalState.result;
  }

  private buildGraph() {
    return new StateGraph(ScriptGenerationState)
      .addNode("loadContext", async (state) => this.loadContext(state))
      .addNode("generateResearchQueries", async (state) => this.generateResearchQueries(state))
      .addNode("researchTopic", async (state) => this.researchTopic(state))
      .addNode("writeScriptPackage", async (state) => this.writeScriptPackage(state))
      .addEdge(START, "loadContext")
      .addEdge("loadContext", "generateResearchQueries")
      .addEdge("generateResearchQueries", "researchTopic")
      .addEdge("researchTopic", "writeScriptPackage")
      .addEdge("writeScriptPackage", END)
      .compile();
  }

  private async loadContext(
    state: ScriptGenerationStateType,
  ): Promise<Partial<ScriptGenerationStateType>> {
    workflowControlService.ensureNotTerminated();
    this.logger.info("Loading context", { genre: state.genre, topic: state.topic });
    const genre = state.genre.trim();
    if (!genre) {
      throw new ConflictError("Genre is required");
    }
    if (!state.topic.trim()) {
      throw new ConflictError("Topic is required");
    }
    if (!state.title.trim()) {
      throw new ConflictError("Title is required");
    }

    const genrePool = await this.genreConfigService.getGenrePool();
    const configuredGenres = normalizeGenres(genrePool.selectedGenres);

    if (configuredGenres.length === 0) {
      throw new ConflictError("No genres are configured");
    }

    if (!configuredGenres.includes(genre)) {
      throw new ConflictError(`Genre "${genre}" is not configured`);
    }

    const recentContent = await this.contentMemoryService.getRecentContent(RECENT_HISTORY_DAYS);
    this.logger.info("Context loaded", { 
      configuredGenresCount: configuredGenres.length, 
      recentContentCount: recentContent.length 
    });

    return {
      configuredGenres,
      recentContent,
    };
  }

  private async generateResearchQueries(
    state: ScriptGenerationStateType,
  ): Promise<Partial<ScriptGenerationStateType>> {
    workflowControlService.ensureNotTerminated();
    this.logger.info("Generating research queries");
    const signal = workflowControlService.getActiveSignal();
    const modelResult = await this.agentRuntime.invokeStructuredJson({
      roleKey: "script-writer",
      systemPrompt: scriptResearchQueryPrompt,
      userPrompt: JSON.stringify(
        {
          genre: state.genre,
          topic: state.topic,
          title: state.title,
          userPreference: state.userPreference ?? null,
          recentContent: state.recentContent,
        },
        null,
        2,
      ),
      schema: scriptResearchQueryResponseSchema,
      ...(signal ? { signal } : {}),
    });

    const queries = normalizeQueries(modelResult.queries);
    this.logger.info("Research queries generated", { queries });

    return {
      researchQueries: queries,
    };
  }

  private async researchTopic(
    state: ScriptGenerationStateType,
  ): Promise<Partial<ScriptGenerationStateType>> {
    workflowControlService.ensureNotTerminated();
    const writerConfig = await this.agentRuntime.getConfig("script-writer");
    const nativeSearchExtraBody = getNativeSearchExtraBody(writerConfig);

    if (nativeSearchExtraBody) {
      this.logger.info("Attempting native research");
      try {
        const signal = workflowControlService.getActiveSignal();
        const nativeResearch = await this.agentRuntime.invokeStructuredJson({
          roleKey: "script-writer",
          systemPrompt: scriptNativeResearchPrompt,
          userPrompt: JSON.stringify(
            {
              genre: state.genre,
              topic: state.topic,
              title: state.title,
              userPreference: state.userPreference ?? null,
              recentContent: state.recentContent,
              researchQueries: state.researchQueries,
            },
            null,
            2,
          ),
          schema: scriptNativeResearchResponseSchema,
          extraBody: nativeSearchExtraBody,
          ...(signal ? { signal } : {}),
        });

        const bundles = normalizeResearchBundles(
          state.researchQueries,
          nativeResearch.researchBundles,
        );
        this.logger.info("Native research successful", { bundleCount: bundles.length });

        return {
          researchBundles: bundles,
        };
      } catch (error) {
        this.logger.error("Native research failed", { error: toErrorMessage(error) });
        pipelineRealtimeService.appendLog(
          `native research fallback: ${toErrorMessage(error)}`,
        );
      }
    }

    this.logger.info("Attempting Tavily research", { queries: state.researchQueries });
    
    // Prepare queries for batch search
    const queries = state.researchQueries.map((query) => ({ query, mode: "auto" as const }));
    
    // Use batch search for efficiency
    const batchResults = await this.searchService.batchSearch(queries, 2); // concurrency limit of 2
    
    const researchBundles = state.researchQueries.map((query) => {
      const results = batchResults.get(query) || [];
      if (results.length > 0) {
        this.logger.info(`Tavily search results for "${query}"`, { count: results.length });
      } else {
        this.logger.warn(`Tavily search failed for "${query}" - no results returned`);
        pipelineRealtimeService.appendLog(
          `research search exhausted for "${query}": no results returned; continuing with empty results`,
        );
      }
      return {
        query,
        results,
      };
    });

    return {
      researchBundles,
    };
  }

  private async writeScriptPackage(
    state: ScriptGenerationStateType,
  ): Promise<Partial<ScriptGenerationStateType>> {
    workflowControlService.ensureNotTerminated();
    this.logger.info("Writing script package", { topic: state.topic });
    const signal = workflowControlService.getActiveSignal();
    const result = await this.agentRuntime.invokeStructuredJson({
      roleKey: "script-writer",
      systemPrompt: scriptGenerationPrompt,
      userPrompt: JSON.stringify(
        {
          genre: state.genre,
          topic: state.topic,
          proposedTitle: state.title,
          userPreference: state.userPreference ?? null,
          recentContent: state.recentContent,
          researchBundles: state.researchBundles,
        },
        null,
        2,
      ),
      schema: scriptPackageSchema,
      ...(signal ? { signal } : {}),
    });

    this.logger.info("Script package written", { 
      title: result.title, 
      topic: result.topic,
      storyLength: result.story.length 
    });

    return {
      result,
    };
  }
}

function normalizeGenres(genres: string[]): string[] {
  return Array.from(new Set(genres.map((genre) => genre.trim()).filter(Boolean)));
}

function normalizeQueries(queries: string[]): string[] {
  const normalizedQueries = Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
  if (normalizedQueries.length !== 3) {
    throw new Error("Script research queries must contain exactly three unique queries");
  }

  return normalizedQueries;
}

function normalizeResearchBundles(
  expectedQueries: string[],
  researchBundles: ResearchBundle[],
): ResearchBundle[] {
  const bundleByQuery = new Map(
    researchBundles.map((bundle) => [bundle.query.trim(), bundle]),
  );

  const missingQueries = expectedQueries.filter((query) => !bundleByQuery.has(query));
  if (missingQueries.length > 0) {
    throw new Error(`Research bundles missing for queries: ${missingQueries.join(", ")}`);
  }

  return expectedQueries.map((query) => ({
    query,
    results: bundleByQuery.get(query)!.results.slice(0, 5),
  }));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
