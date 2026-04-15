import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

export class ReadabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadabilityError";
  }
}

export class FetchTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchTimeoutError";
  }
}

export class FetchHttpStatusError extends Error {
  status: number;

  constructor(status: number) {
    super(`Page returned HTTP ${status}`);
    this.name = "FetchHttpStatusError";
    this.status = status;
  }
}

export type ExtractResult = {
  title: string;
  markdown: string;
  sourceUrl: string;
  truncated: boolean;
};

const USER_AGENT = "Mozilla/5.0 (compatible; MCPWebSearch/1.0)";

function collapseBlankLines(markdown: string): string {
  return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

function truncateAtParagraphBoundary(
  markdown: string,
  maxLength: number,
): { content: string; truncated: boolean } {
  if (markdown.length <= maxLength) {
    return { content: markdown, truncated: false };
  }

  const cutPoint = markdown.lastIndexOf("\n\n", maxLength);
  if (cutPoint > 0) {
    return { content: markdown.slice(0, cutPoint).trimEnd(), truncated: true };
  }

  return { content: markdown.slice(0, maxLength).trimEnd(), truncated: true };
}

export async function extractReadableMarkdown(
  url: string,
  timeoutMs: number,
  maxLength: number,
): Promise<ExtractResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new FetchTimeoutError(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new FetchHttpStatusError(response.status);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const readable = new Readability(dom.window.document).parse();

  if (!readable?.content) {
    throw new ReadabilityError("Could not extract content from page");
  }

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  const markdown = collapseBlankLines(turndown.turndown(readable.content));
  const truncatedResult = truncateAtParagraphBoundary(markdown, maxLength);

  return {
    title: readable.title?.trim() || "Untitled",
    markdown: truncatedResult.content,
    sourceUrl: url,
    truncated: truncatedResult.truncated,
  };
}
