import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { searchWithBrave } from "../src/providers/brave.js";
import { handleWebSearch } from "../src/tools/search.js";
import { withTestServer } from "./helpers/http-server.js";

const originalBraveApiKey = process.env.BRAVE_API_KEY;
const originalBraveEndpoint = process.env.BRAVE_ENDPOINT;

function restoreBraveEnv(): void {
  if (originalBraveApiKey === undefined) {
    delete process.env.BRAVE_API_KEY;
  } else {
    process.env.BRAVE_API_KEY = originalBraveApiKey;
  }

  if (originalBraveEndpoint === undefined) {
    delete process.env.BRAVE_ENDPOINT;
  } else {
    process.env.BRAVE_ENDPOINT = originalBraveEndpoint;
  }
}

function getTextContent(result: { content: Array<{ type: string; text?: string }> }): string {
  const [contentItem] = result.content;
  assert.equal(contentItem?.type, "text");
  return contentItem.text ?? "";
}

afterEach(() => {
  restoreBraveEnv();
});

test("searchWithBrave maps, trims, filters, and limits response entries", async () => {
  await withTestServer(
    (request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");

      assert.equal(requestUrl.pathname, "/search");
      assert.equal(requestUrl.searchParams.get("q"), "copilot testing");
      assert.equal(requestUrl.searchParams.get("count"), "2");
      assert.equal(request.headers["x-subscription-token"], "local-test-key");

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          web: {
            results: [
              {
                title: "  Result A  ",
                url: "  https://example.com/a  ",
                description: "  Description A  ",
              },
              {
                title: "No URL",
                description: "Should be ignored",
              },
              {
                url: " https://example.com/b ",
              },
            ],
          },
        }),
      );
    },
    async (baseUrl) => {
      process.env.BRAVE_ENDPOINT = `${baseUrl}/search`;

      const results = await searchWithBrave("copilot testing", 2, "local-test-key");

      assert.deepEqual(results, [
        {
          title: "Result A",
          url: "https://example.com/a",
          description: "Description A",
        },
        {
          title: "Untitled",
          url: "https://example.com/b",
          description: "No description provided.",
        },
      ]);
    },
  );
});

test("searchWithBrave rejects invalid provider JSON payloads", async () => {
  await withTestServer(
    (_request, response) => {
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("this is not json");
    },
    async (baseUrl) => {
      process.env.BRAVE_ENDPOINT = `${baseUrl}/search`;

      await assert.rejects(
        () => searchWithBrave("copilot", 1, "local-test-key"),
        /Brave returned invalid JSON/,
      );
    },
  );
});

test("handleWebSearch returns formatted Brave results", async () => {
  await withTestServer(
    (_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Result One",
                url: "https://example.com/one",
                description: "A useful snippet",
              },
            ],
          },
        }),
      );
    },
    async (baseUrl) => {
      process.env.BRAVE_ENDPOINT = `${baseUrl}/search`;
      process.env.BRAVE_API_KEY = "local-test-key";

      const result = await handleWebSearch({
        query: "copilot",
        count: 1,
        provider: "brave",
      });

      const text = getTextContent(result);
      assert.equal(
        text,
        "[1] Result One\nURL: https://example.com/one\nSnippet: A useful snippet",
      );
    },
  );
});

test("handleWebSearch reports provider HTTP failures as tool text errors", async () => {
  await withTestServer(
    (_request, response) => {
      response.statusCode = 503;
      response.end();
    },
    async (baseUrl) => {
      process.env.BRAVE_ENDPOINT = `${baseUrl}/search`;
      process.env.BRAVE_API_KEY = "local-test-key";

      const result = await handleWebSearch({
        query: "copilot",
        count: 1,
        provider: "brave",
      });

      assert.equal(
        getTextContent(result),
        "Error: Brave request failed with HTTP 503",
      );
    },
  );
});
