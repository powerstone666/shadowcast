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

export class TavilySearchService {
  private readonly logger = new Logger("tavily-search-service");
  private readonly client = tavily({ apiKey: process.env.TAVILY_API_KEY ?? "" });

  constructor(private readonly maxResults = 5) {
    if (!process.env.TAVILY_API_KEY) {
      this.logger.warn("TAVILY_API_KEY is not set. Tavily search will fail.");
    }
  }

  async search(query: string, mode: SearchMode = "auto"): Promise<SearchResult[]> {
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
