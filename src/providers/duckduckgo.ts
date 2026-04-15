import { SafeSearchType, search } from "duck-duck-scrape";

import type { SearchResult } from "./brave.js";

export class DuckDuckGoSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuckDuckGoSearchError";
  }
}

export async function searchWithDuckDuckGo(query: string, count: number): Promise<SearchResult[]> {
  try {
    const response = await search(query, { safeSearch: SafeSearchType.OFF });

    return (response.results ?? [])
      .map((item) => ({
        title: item.title?.trim() ?? "Untitled",
        url: item.url?.trim() ?? "",
        description: item.description?.trim() ?? "No description provided.",
      }))
      .filter((item) => item.url.length > 0)
      .slice(0, count);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    throw new DuckDuckGoSearchError(`DuckDuckGo request failed: ${message}`);
  }
}
