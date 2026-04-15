import { z } from "zod";

import { BraveSearchError, searchWithBrave } from "../providers/brave.js";
import { DuckDuckGoSearchError, searchWithDuckDuckGo } from "../providers/duckduckgo.js";

const PROVIDERS = ["brave", "duckduckgo", "auto"] as const;

type SearchProvider = (typeof PROVIDERS)[number];

type SearchInput = {
  query: string;
  count?: number;
  provider?: SearchProvider;
};

type SearchResult = {
  title: string;
  url: string;
  description: string;
};

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function clampCount(value: number): number {
  return Math.max(1, Math.min(10, value));
}

function parseDefaultCount(): number {
  const parsed = Number.parseInt(process.env.SEARCH_RESULT_COUNT ?? "5", 10);
  return Number.isNaN(parsed) ? 5 : clampCount(parsed);
}

function parseDefaultProvider(): SearchProvider {
  const raw = (process.env.SEARCH_PROVIDER ?? "auto").toLowerCase();
  if (PROVIDERS.includes(raw as SearchProvider)) {
    return raw as SearchProvider;
  }
  return "auto";
}

const DEFAULT_RESULT_COUNT = parseDefaultCount();
const DEFAULT_PROVIDER = parseDefaultProvider();

function formatResults(results: SearchResult[], note?: string): string {
  const blocks = results.map(
    (result, index) =>
      `[${index + 1}] ${result.title}\nURL: ${result.url}\nSnippet: ${result.description}`,
  );

  if (note) {
    return [note, "", ...blocks].join("\n");
  }

  return blocks.join("\n\n");
}

async function runSearch(
  query: string,
  count: number,
  provider: SearchProvider,
  braveApiKey: string | undefined,
): Promise<{ results: SearchResult[]; note?: string }> {
  if (provider === "brave") {
    return { results: await searchWithBrave(query, count, braveApiKey) };
  }

  if (provider === "duckduckgo") {
    return { results: await searchWithDuckDuckGo(query, count) };
  }

  if (braveApiKey) {
    try {
      return { results: await searchWithBrave(query, count, braveApiKey) };
    } catch (error) {
      if (error instanceof BraveSearchError) {
        const fallback = await searchWithDuckDuckGo(query, count);
        return {
          results: fallback,
          note: "[Note: Brave Search failed, results from DuckDuckGo]",
        };
      }
      throw error;
    }
  }

  return { results: await searchWithDuckDuckGo(query, count) };
}

export const webSearchSchema = {
  query: z.string().min(1).describe("The search query"),
  count: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(DEFAULT_RESULT_COUNT)
    .describe("Number of results to return"),
  provider: z
    .enum(PROVIDERS)
    .optional()
    .default(DEFAULT_PROVIDER)
    .describe("Which search provider to use"),
};

export async function handleWebSearch(input: SearchInput) {
  try {
    const query = input.query.trim();
    const count = input.count ?? DEFAULT_RESULT_COUNT;
    const provider = input.provider ?? DEFAULT_PROVIDER;

    const { results, note } = await runSearch(query, count, provider, process.env.BRAVE_API_KEY);

    if (results.length === 0) {
      const emptyNote = note ? `${note}\n\n` : "";
      return textResult(`${emptyNote}No results found.`);
    }

    return textResult(formatResults(results, note));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    const isExpected = error instanceof BraveSearchError || error instanceof DuckDuckGoSearchError;

    return textResult(
      isExpected ? `Error: ${message}` : `Error: Unexpected search failure - ${message}`,
    );
  }
}
