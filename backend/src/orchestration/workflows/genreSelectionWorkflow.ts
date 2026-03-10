import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import { ConflictError, isWorkflowTerminatedError } from "../errors.js";
import { loadPrompt } from "../prompts/loadPrompt.js";
import { getNativeSearchExtraBody } from "../runtime/nativeSearchSupport.js";
import { AgentRuntime } from "../runtime/AgentRuntime.js";
import {
  TavilySearchService,
  type SearchResult,
  type SearchMode,
} from "../tools/tavilySearchService.js";
import { Logger } from "../../utils/commonUtils.js";
import {
  ContentMemoryService,
  type RecentContentItem,
} from "../../services/contentMemoryService.js";
import { GenreConfigService } from "../../services/genreConfigService.js";
import { pipelineRealtimeService } from "../../services/pipelineRealtimeService.js";
import { workflowCacheService } from "../../services/workflowCacheService.js";
import { workflowControlService } from "../../services/workflowControlService.js";

const RECENT_HISTORY_DAYS = 14;

const genreSearchQuerySchema = z.object({
  genre: z.string().trim().min(1),
  query: z.string().trim().min(1),
});

const genreSearchQueryResponseSchema = z.object({
  searchQueries: z.array(genreSearchQuerySchema).min(1),
});

const comprehensiveSearchQueryResponseSchema = z.object({
  comprehensiveQuery: z.string().trim().min(1),
});

const genreCandidateResponseSchema = z.object({
  candidateGenres: z.array(z.string().trim().min(1)).min(1).max(3),
});

const genreSelectionResponseSchema = z.object({
  selectedGenre: z.string().trim().min(1),
  topic: z.string().trim().min(1),
  title: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});

const genreCandidatePrompt = loadPrompt(
  "genreCandidatePrompt.txt",
  import.meta.url,
);
const genreNativeSearchPrompt = loadPrompt(
  "genreNativeSearchPrompt.txt",
  import.meta.url,
);
const genreSearchQueryPrompt = loadPrompt(
  "genreSearchQueryPrompt.txt",
  import.meta.url,
);

const genreSelectionPrompt = loadPrompt(
  "genreSelectionPrompt.txt",
  import.meta.url,
);

function buildTemporalContext(): {
  currentDate: string;
  currentYear: number;
} {
  const now = new Date();
  return {
    currentDate: now.toISOString().slice(0, 10),
    currentYear: now.getUTCFullYear(),
  };
}

type SearchQuery = z.infer<typeof genreSearchQuerySchema>;

type SearchBundle = {
  genre: string;
  query: string;
  results: SearchResult[];
};

type GenreSelectionResult = {
  selectedGenre: string;
  topic: string;
  title: string;
  reason: string;
  searchHighlights: Array<{
    genre: string;
    headlines: string[];
  }>;
};

type WorkflowInput = {
  userPreference: string | undefined;
};

const GenreSelectionState = Annotation.Root({
  userPreference: Annotation<string | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  selectedGenres: Annotation<string[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  recentContent: Annotation<RecentContentItem[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  recentGenres: Annotation<string[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  candidateGenres: Annotation<string[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  searchQueries: Annotation<SearchQuery[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  searchBundles: Annotation<SearchBundle[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  selection: Annotation<
    z.infer<typeof genreSelectionResponseSchema> | undefined
  >({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  result: Annotation<GenreSelectionResult | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
});

type GenreSelectionStateType = typeof GenreSelectionState.State;

export class GenreSelectionWorkflow {
  private readonly graph;
  private readonly logger = new Logger("genre-selection-workflow");

  constructor(
    private readonly agentRuntime = new AgentRuntime(),
    private readonly genreConfigService = new GenreConfigService(),
    private readonly contentMemoryService = new ContentMemoryService(),
    private readonly searchService = new TavilySearchService(),
  ) {
    this.graph = this.buildGraph();
  }

  async run(input: WorkflowInput): Promise<GenreSelectionResult> {
    const cachedResult =
      await workflowCacheService.getCachedResult<GenreSelectionResult>(
        "genreSelection",
      );
    if (cachedResult) {
      pipelineRealtimeService.appendLog("loaded genre selection from cache");
      return cachedResult;
    }

    const finalState = await this.graph.invoke({
      userPreference: input.userPreference,
    });

    if (!finalState.result) {
      throw new Error("Genre selection workflow did not produce a result");
    }

    await workflowCacheService.saveResult("genreSelection", finalState.result);
    return finalState.result;
  }

  private buildGraph() {
    return new StateGraph(GenreSelectionState)
      .addNode("loadContext", async () => this.loadContext())
      .addNode("shortlistGenres", async (state) => this.shortlistGenres(state))
      .addNode("generateSearchQueries", async (state) =>
        this.generateSearchQueries(state),
      )
      .addNode("tryTavilySelection", async (state) =>
        this.tryTavilySelection(state),
      )
      .addNode("tryNativeSelection", async (state) =>
        this.tryNativeSelection(state),
      )
      .addNode("tryHtmlScrapeSelection", async (state) =>
        this.tryHtmlScrapeSelection(state),
      )
      .addNode("formatResult", async (state) => this.formatResult(state))
      .addEdge(START, "loadContext")
      .addEdge("loadContext", "shortlistGenres")
      .addEdge("shortlistGenres", "generateSearchQueries")
      .addEdge("generateSearchQueries", "tryTavilySelection")
      .addEdge("tryTavilySelection", "tryNativeSelection")
      .addEdge("tryNativeSelection", "tryHtmlScrapeSelection")
      .addEdge("tryHtmlScrapeSelection", "formatResult")
      .addEdge("formatResult", END)
      .compile();
  }

  private async loadContext(): Promise<Partial<GenreSelectionStateType>> {
    workflowControlService.ensureNotTerminated();
    const genrePool = await this.genreConfigService.getGenrePool();
    const selectedGenres = normalizeSelectedGenres(genrePool.selectedGenres);

    if (selectedGenres.length === 0) {
      throw new ConflictError("No genres are configured");
    }

    const recentContent =
      await this.contentMemoryService.getRecentContent(RECENT_HISTORY_DAYS);

    return {
      selectedGenres,
      recentContent,
      recentGenres: recentContent.map((item) => item.genre),
    };
  }

  private async tryTavilySelection(
    state: GenreSelectionStateType,
  ): Promise<Partial<GenreSelectionStateType>> {
    workflowControlService.ensureNotTerminated();
    if (state.selection) return {};

    this.logger.info("Attempting Tavily search selection", {
      candidateCount: state.candidateGenres.length,
      queries: state.searchQueries.map((q) => q.query),
    });
    pipelineRealtimeService.appendLog("attempting Tavily search selection");
    const searchUpdates = await this.searchGenres(state, "tavily");
    if (
      !searchUpdates.searchBundles ||
      searchUpdates.searchBundles.length === 0
    ) {
      this.logger.warn("Tavily search produced no bundles");
      return {};
    }

    const selectionUpdate = await this.selectGenre({
      ...state,
      ...searchUpdates,
    });
    if (selectionUpdate.selection) {
      this.logger.info("Tavily selection successful", {
        genre: selectionUpdate.selection.selectedGenre,
        topic: selectionUpdate.selection.topic,
      });
      return {
        ...selectionUpdate,
        searchBundles: searchUpdates.searchBundles,
      };
    }
    this.logger.info(
      "Tavily search completed but no genre was selected from it",
    );
    return searchUpdates;
  }

  private async tryNativeSelection(
    state: GenreSelectionStateType,
  ): Promise<Partial<GenreSelectionStateType>> {
    workflowControlService.ensureNotTerminated();
    if (state.selection) return {};
    pipelineRealtimeService.appendLog("attempting native LLM search selection");
    this.logger.info("Attempting native LLM search selection");
    const selectorConfig = await this.agentRuntime.getConfig("selector");
    const nativeSearchExtraBody = getNativeSearchExtraBody(selectorConfig);
    if (!nativeSearchExtraBody) {
      this.logger.warn("Native search not supported for this provider");
      return {};
    }

    try {
      const signal = workflowControlService.getActiveSignal();
      const temporalContext = buildTemporalContext();
      const selection = await this.agentRuntime.invokeStructuredJson({
        roleKey: "selector",
        systemPrompt: genreNativeSearchPrompt,
        userPrompt: JSON.stringify(
          {
            ...temporalContext,
            selectedGenres: state.selectedGenres,
            userPreference: state.userPreference ?? null,
            recentContent: state.recentContent,
            recentGenres: state.recentGenres,
          },
          null,
          2,
        ),
        schema: genreSelectionResponseSchema,
        extraBody: nativeSearchExtraBody,
        ...(signal ? { signal } : {}),
      });

      this.logger.info("Native selection successful", {
        genre: selection.selectedGenre,
        topic: selection.topic,
      });
      return { selection };
    } catch (error) {
      if (isWorkflowTerminatedError(error)) throw error;
      this.logger.error("Native selection failed", {
        error: toErrorMessage(error),
      });
      pipelineRealtimeService.appendLog(
        `native selection failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return {};
    }
  }

  private async tryHtmlScrapeSelection(
    state: GenreSelectionStateType,
  ): Promise<Partial<GenreSelectionStateType>> {
    workflowControlService.ensureNotTerminated();
    if (state.selection) return {};

    this.logger.info("Attempting HTML scrape search selection", {
      queries: state.searchQueries.map((q) => q.query),
    });
    pipelineRealtimeService.appendLog(
      "attempting HTML scrape search selection",
    );
    const searchUpdates = await this.searchGenres(state, "scrape");
    if (
      !searchUpdates.searchBundles ||
      searchUpdates.searchBundles.length === 0
    ) {
      this.logger.warn("HTML scrape produced no bundles");
      return {};
    }

    const selectionUpdate = await this.selectGenre({
      ...state,
      ...searchUpdates,
    });
    if (selectionUpdate.selection) {
      this.logger.info("HTML scrape selection successful", {
        genre: selectionUpdate.selection.selectedGenre,
        topic: selectionUpdate.selection.topic,
      });
      return {
        ...selectionUpdate,
        searchBundles: searchUpdates.searchBundles,
      };
    }
    this.logger.info(
      "HTML scrape search completed but no genre was selected from it",
    );
    return searchUpdates;
  }

  private async shortlistGenres(
    state: GenreSelectionStateType,
  ): Promise<Partial<GenreSelectionStateType>> {
    workflowControlService.ensureNotTerminated();

    const signal = workflowControlService.getActiveSignal();
    const temporalContext = buildTemporalContext();
    const modelResult = await this.agentRuntime.invokeStructuredJson({
      roleKey: "selector",
      systemPrompt: genreCandidatePrompt,
      userPrompt: JSON.stringify(
        {
          ...temporalContext,
          selectedGenres: state.selectedGenres,
          userPreference: state.userPreference ?? null,
          recentContent: state.recentContent,
          recentGenres: state.recentGenres,
        },
        null,
        2,
      ),
      schema: genreCandidateResponseSchema,
      ...(signal ? { signal } : {}),
    });

    return {
      candidateGenres: mapCandidateGenres(
        state.selectedGenres,
        modelResult.candidateGenres,
      ),
    };
  }

  private async generateSearchQueries(
    state: GenreSelectionStateType,
  ): Promise<Partial<GenreSelectionStateType>> {
    workflowControlService.ensureNotTerminated();

    const signal = workflowControlService.getActiveSignal();
    const temporalContext = buildTemporalContext();
    const modelResult = await this.agentRuntime.invokeStructuredJson({
      roleKey: "selector",
      systemPrompt: genreSearchQueryPrompt,
      userPrompt: JSON.stringify(
        {
          ...temporalContext,
          selectedGenres: state.candidateGenres,
          userPreference: state.userPreference ?? null,
          recentContent: state.recentContent,
          recentGenres: state.recentGenres,
        },
        null,
        2,
      ),
      schema: comprehensiveSearchQueryResponseSchema,
      ...(signal ? { signal } : {}),
    });

    // Create a single search query entry for all genres
    const searchQueries: SearchQuery[] = state.candidateGenres.map((genre) => ({
      genre,
      query: modelResult.comprehensiveQuery,
    }));

    return {
      searchQueries,
    };
  }

  private async searchGenres(
    state: GenreSelectionStateType,
    mode: SearchMode = "auto",
  ): Promise<Partial<GenreSelectionStateType>> {
    workflowControlService.ensureNotTerminated();

    // Get unique queries (all will be the same comprehensive query)
    const uniqueQueries = Array.from(
      new Set(state.searchQueries.map((sq) => sq.query)),
    );

    // Prepare queries for batch search (deduplicated)
    const queries = uniqueQueries.map((query) => ({ query, mode }));

    // Use batch search for efficiency - will make only 1 API call due to caching
    const batchResults = await this.searchService.batchSearch(queries, 2); // concurrency limit of 2

    const searchBundles: SearchBundle[] = state.searchQueries.map(
      (searchQuery) => {
        const results = batchResults.get(searchQuery.query) || [];
        return {
          genre: searchQuery.genre,
          query: searchQuery.query,
          results,
        };
      },
    );

    const searchResultsCount =
      uniqueQueries.length > 0
        ? (batchResults.get(uniqueQueries[0]!) || []).length
        : 0;

    this.logger.info("Search completed", {
      uniqueQueries: uniqueQueries.length,
      totalGenres: state.searchQueries.length,
      searchResultsCount,
    });

    return {
      searchBundles,
    };
  }

  private async selectGenre(
    state: GenreSelectionStateType,
  ): Promise<Partial<GenreSelectionStateType>> {
    workflowControlService.ensureNotTerminated();
    if (state.selection) {
      return {};
    }

    const signal = workflowControlService.getActiveSignal();
    const temporalContext = buildTemporalContext();
    const selection = await this.agentRuntime.invokeStructuredJson({
      roleKey: "selector",
      systemPrompt: genreSelectionPrompt,
      userPrompt: JSON.stringify(
        {
          ...temporalContext,
          selectedGenres: state.candidateGenres,
          userPreference: state.userPreference ?? null,
          recentContent: state.recentContent,
          recentGenres: state.recentGenres,
          searchBundles: state.searchBundles,
        },
        null,
        2,
      ),
      schema: genreSelectionResponseSchema,
      ...(signal ? { signal } : {}),
    });

    return {
      selection,
    };
  }

  private async formatResult(
    state: GenreSelectionStateType,
  ): Promise<Partial<GenreSelectionStateType>> {
    if (!state.selection) {
      throw new Error("Genre selection result is missing");
    }

    return {
      result: {
        selectedGenre: state.selection.selectedGenre,
        topic: state.selection.topic,
        title: state.selection.title,
        reason: state.selection.reason,
        searchHighlights: state.searchBundles.map((bundle) => ({
          genre: bundle.genre,
          headlines: bundle.results.map((result) => result.title),
        })),
      },
    };
  }
}

function normalizeSelectedGenres(genres: string[]): string[] {
  return Array.from(
    new Set(genres.map((genre) => genre.trim()).filter(Boolean)),
  );
}

function mapCandidateGenres(
  _selectedGenres: string[],
  candidateGenres: string[],
): string[] {
  // Accept any genre the AI suggests — configured genres are passed to the AI
  // as preferences/hints via the prompt, not enforced as a hard allowlist here.
  const normalizedCandidates = Array.from(
    new Set(candidateGenres.map((genre) => genre.trim()).filter(Boolean)),
  );

  if (normalizedCandidates.length === 0) {
    throw new Error("Genre shortlist produced no candidates");
  }

  return normalizedCandidates.slice(0, 3);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export type { GenreSelectionResult };
