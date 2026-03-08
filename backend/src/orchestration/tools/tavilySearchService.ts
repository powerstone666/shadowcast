import { tavily } from "@tavily/core";
import { z } from "zod";

import { Logger } from "../../utils/commonUtils.js";

const DDG_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/";

const normalizedSearchItemSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().trim().min(1),
  snippet: z.string(),
});

export type SearchResult = z.infer<typeof normalizedSearchItemSchema>;

export type SearchMode = "tavily" | "scrape" | "auto";

type QueryWithMetadata = {
  query: string;
  mode?: SearchMode;
};

export class TavilySearchService {
  private readonly logger = new Logger("tavily-search-service");
  private readonly client = tavily({ apiKey: process.env.TAVILY_API_KEY ?? "" });
  private readonly searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly maxResults = 5) {
    if (!process.env.TAVILY_API_KEY) {
      this.logger.warn("TAVILY_API_KEY is not set. Tavily search will fail.");
    }
  }

  async search(query: string, mode: SearchMode = "auto"): Promise<SearchResult[]> {
    const cacheKey = `${query}:${mode}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      this.logger.info("Returning cached search results", { query, mode, count: cached.results.length });
      return cached.results;
    }

    if (mode === "scrape") {
      return this.runHtmlScrapeFallback(query);
    }

    try {
      this.logger.info("Tavily search attempt", { query, mode });
      
      const response = await this.client.search(query, {
        searchDepth: "basic",
        maxResults: this.maxResults,
      });

      const parsedResults = response.results
        .map((result) => {
          const parsed = normalizedSearchItemSchema.safeParse({
            title: result.title,
            url: result.url,
            snippet: result.content,
          });
          return parsed.success ? parsed.data : null;
        })
        .filter((result): result is SearchResult => result !== null);

      this.logger.info("Tavily search succeeded", {
        query,
        count: parsedResults.length,
      });

      this.searchCache.set(cacheKey, { results: parsedResults, timestamp: Date.now() });
      return parsedResults;
    } catch (error) {
      if (mode === "tavily") {
        this.logger.warn("Tavily API search failed (tavily-only mode)", {
          query,
          message: toErrorMessage(error),
        });
        throw error;
      }

      this.logger.warn("Tavily search failed, switching to DuckDuckGo HTML scraping fallback", {
        query,
        message: toErrorMessage(error),
      });

      return this.runHtmlScrapeFallback(query);
    }
  }

  async batchSearch(queries: QueryWithMetadata[], concurrencyLimit = 2): Promise<Map<string, SearchResult[]>> {
    const results = new Map<string, SearchResult[]>();
    const queriesToProcess: QueryWithMetadata[] = [];

    // Check cache first
    for (const { query, mode = "auto" } of queries) {
      const cacheKey = `${query}:${mode}`;
      const cached = this.searchCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.logger.info("Using cached results for batch query", { query, mode });
        results.set(query, cached.results);
      } else {
        queriesToProcess.push({ query, mode });
      }
    }

    if (queriesToProcess.length === 0) {
      return results;
    }

    this.logger.info("Processing batch search", {
      totalQueries: queries.length,
      cached: queries.length - queriesToProcess.length,
      toProcess: queriesToProcess.length,
      concurrencyLimit,
    });

    // Process remaining queries with concurrency control
    for (let i = 0; i < queriesToProcess.length; i += concurrencyLimit) {
      const batch = queriesToProcess.slice(i, i + concurrencyLimit);
      await Promise.all(
        batch.map(async ({ query, mode = "auto" }) => {
          try {
            const searchResults = await this.search(query, mode);
            results.set(query, searchResults);
          } catch (error) {
            this.logger.warn(`Batch search failed for query: "${query}"`, {
              error: toErrorMessage(error),
            });
            results.set(query, []);
          }
        }),
      );
    }

    return results;
  }

  clearCache(): void {
    this.searchCache.clear();
    this.logger.info("Search cache cleared");
  }

  private async runHtmlScrapeFallback(query: string): Promise<SearchResult[]> {
    try {
      const scrapedResults = await scrapeDuckDuckGoHtml(query, this.maxResults);
      if (scrapedResults.length === 0) {
        throw new Error("DuckDuckGo HTML scrape returned no results");
      }

      this.logger.info("DuckDuckGo HTML scrape fallback completed", {
        query,
        count: scrapedResults.length,
      });

      return scrapedResults;
    } catch (error) {
       this.logger.warn("DuckDuckGo HTML scrape fallback failed", {
        query,
        message: toErrorMessage(error),
      });
      throw error instanceof Error ? error : new Error("All search mechanisms failed");
    }
  }
}

async function scrapeDuckDuckGoHtml(query: string, limit: number): Promise<SearchResult[]> {
  const searchUrl = new URL(DDG_HTML_SEARCH_URL);
  searchUrl.searchParams.set("q", query);

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo HTML fallback failed with status ${response.status}`);
  }

  const html = await response.text();
  return parseDuckDuckGoHtmlResults(html).slice(0, limit);
}

function parseDuckDuckGoHtmlResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const anchorRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let anchorMatch: RegExpExecArray | null;
  while ((anchorMatch = anchorRegex.exec(html)) !== null) {
    const rawUrl = anchorMatch[1];
    const rawTitle = anchorMatch[2];
    if (!rawUrl || !rawTitle) {
      continue;
    }

    const url = decodeHtmlEntities(rawUrl).trim();
    const title = stripHtml(rawTitle);
    if (!url || !title) {
      continue;
    }

    const snippetWindow = html.slice(anchorMatch.index, anchorMatch.index + 1600);
    const snippetMatch = snippetWindow.match(
      /<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i,
    );

    results.push({
      title,
      url,
      snippet: snippetMatch?.[1] ? stripHtml(snippetMatch[1]) : "",
    });
  }

  return results;
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
