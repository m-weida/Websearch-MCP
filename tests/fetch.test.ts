import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { handleFetchPage } from "../src/tools/fetch.js";
import {
  extractReadableMarkdown,
  FetchHttpStatusError,
} from "../src/utils/extract.js";
import { withTestServer } from "./helpers/http-server.js";

const originalFetchTimeout = process.env.FETCH_TIMEOUT_MS;

function getTextContent(result: { content: Array<{ type: string; text?: string }> }): string {
  const [contentItem] = result.content;
  assert.equal(contentItem?.type, "text");
  return contentItem.text ?? "";
}

afterEach(() => {
  if (originalFetchTimeout === undefined) {
    delete process.env.FETCH_TIMEOUT_MS;
  } else {
    process.env.FETCH_TIMEOUT_MS = originalFetchTimeout;
  }
});

test("extractReadableMarkdown parses readable html and preserves source URL", async () => {
  await withTestServer(
    (_request, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`
        <!doctype html>
        <html>
          <head><title>Readable Doc</title></head>
          <body>
            <main>
              <article>
                <h1>Readable Heading</h1>
                <p>First paragraph in the article.</p>
                <p>Second paragraph in the article.</p>
              </article>
            </main>
          </body>
        </html>
      `);
    },
    async (baseUrl) => {
      const sourceUrl = `${baseUrl}/article`;
      const result = await extractReadableMarkdown(sourceUrl, 2_000, 8_000);

      assert.equal(result.title, "Readable Doc");
      assert.equal(result.sourceUrl, sourceUrl);
      assert.equal(result.truncated, false);
      assert.match(result.markdown, /Readable Heading/);
      assert.match(result.markdown, /First paragraph in the article\./);
    },
  );
});

test("extractReadableMarkdown truncates long content at paragraph boundaries", async () => {
  await withTestServer(
    (_request, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`
        <!doctype html>
        <html>
          <head><title>Truncation Doc</title></head>
          <body>
            <article>
              <p>Paragraph one has enough text to exceed a short max length quickly.</p>
              <p>Paragraph two should be dropped when truncating at a paragraph boundary.</p>
            </article>
          </body>
        </html>
      `);
    },
    async (baseUrl) => {
      const result = await extractReadableMarkdown(`${baseUrl}/truncate`, 2_000, 100);

      assert.equal(result.truncated, true);
      assert.ok(result.markdown.length <= 100);
      assert.doesNotMatch(result.markdown, /Paragraph two should be dropped/);
    },
  );
});

test("extractReadableMarkdown throws typed status errors for non-OK responses", async () => {
  await withTestServer(
    (_request, response) => {
      response.statusCode = 418;
      response.end("teapot");
    },
    async (baseUrl) => {
      await assert.rejects(
        () => extractReadableMarkdown(`${baseUrl}/status`, 2_000, 8_000),
        (error: unknown) => error instanceof FetchHttpStatusError && error.status === 418,
      );
    },
  );
});

test("handleFetchPage maps timeout and readability failures to user-facing errors", async () => {
  await withTestServer(
    (request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");

      if (requestUrl.pathname === "/slow") {
        setTimeout(() => {
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end("<html><body><article><p>Delayed content</p></article></body></html>");
        }, 1_200);
        return;
      }

      if (requestUrl.pathname === "/empty") {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end("<html><head><title>Empty</title></head><body></body></html>");
        return;
      }

      response.statusCode = 404;
      response.end();
    },
    async (baseUrl) => {
      process.env.FETCH_TIMEOUT_MS = "1000";
      const timeoutResult = await handleFetchPage({
        url: `${baseUrl}/slow`,
        maxLength: 500,
      });

      assert.match(
        getTextContent(timeoutResult),
        /Error: Could not fetch URL .*Request timed out after 1000ms/,
      );

      process.env.FETCH_TIMEOUT_MS = "2000";
      const readabilityResult = await handleFetchPage({
        url: `${baseUrl}/empty`,
        maxLength: 500,
      });

      assert.equal(
        getTextContent(readabilityResult),
        "Error: Could not extract readable content from this page. It may be a SPA, login-gated, or media-only page.",
      );
    },
  );
});

test("handleFetchPage formats markdown output with title, source, and truncation note", async () => {
  await withTestServer(
    (_request, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`
        <!doctype html>
        <html>
          <head><title>Formatting Doc</title></head>
          <body>
            <article>
              <h1>Formatting Heading</h1>
              <p>This is a long paragraph that makes the markdown exceed the requested maximum length.</p>
              <p>This second paragraph should be omitted in truncated output.</p>
            </article>
          </body>
        </html>
      `);
    },
    async (baseUrl) => {
      const result = await handleFetchPage({
        url: `${baseUrl}/format`,
        maxLength: 120,
      });

      const text = getTextContent(result);
      assert.match(text, /^# Formatting Doc\n\nSource: /);
      assert.match(text, /---/);
      assert.match(text, /\[Truncated to 120 characters\]$/);
      assert.doesNotMatch(text, /second paragraph should be omitted/i);
    },
  );
});
