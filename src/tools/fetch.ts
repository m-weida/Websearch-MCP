import { z } from "zod";

import {
  extractReadableMarkdown,
  FetchHttpStatusError,
  FetchTimeoutError,
  ReadabilityError,
} from "../utils/extract.js";

type FetchInput = {
  url: string;
  maxLength?: number;
};

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function parseTimeoutMs(): number {
  const raw = Number.parseInt(process.env.FETCH_TIMEOUT_MS ?? "8000", 10);
  if (Number.isNaN(raw) || raw < 1000) {
    return 8000;
  }
  return raw;
}

function formatFetchOutput(
  title: string,
  sourceUrl: string,
  markdown: string,
  maxLength: number,
  truncated: boolean,
): string {
  const lines = [`# ${title}`, "", `Source: ${sourceUrl}`, "", "---", "", markdown, "", "---"];

  if (truncated) {
    lines.push(`[Truncated to ${maxLength} characters]`);
  }

  return lines.join("\n");
}

export const fetchPageSchema = {
  url: z.string().url().describe("The URL to fetch and read"),
  maxLength: z
    .number()
    .int()
    .min(500)
    .max(20000)
    .optional()
    .default(5000)
    .describe("Max characters of Markdown to return (truncates cleanly at paragraph boundary)"),
};

export async function handleFetchPage(input: FetchInput) {
  try {
    const timeoutMs = parseTimeoutMs();
    const maxLength = input.maxLength ?? 5000;
    const extracted = await extractReadableMarkdown(input.url, timeoutMs, maxLength);

    return textResult(
      formatFetchOutput(
        extracted.title,
        extracted.sourceUrl,
        extracted.markdown,
        maxLength,
        extracted.truncated,
      ),
    );
  } catch (error) {
    if (error instanceof FetchHttpStatusError) {
      return textResult(`Error: Page returned HTTP ${error.status}`);
    }

    if (error instanceof FetchTimeoutError) {
      return textResult(`Error: Could not fetch URL — ${error.message}`);
    }

    if (error instanceof ReadabilityError) {
      return textResult(
        "Error: Could not extract readable content from this page. It may be a SPA, login-gated, or media-only page.",
      );
    }

    const message = error instanceof Error ? error.message : "Unknown fetch error";
    return textResult(`Error: Could not fetch URL — ${message}`);
  }
}
