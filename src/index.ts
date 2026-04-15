import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { fetchPageSchema, handleFetchPage } from "./tools/fetch.js";
import { handleWebSearch, webSearchSchema } from "./tools/search.js";

const server = new McpServer({
  name: "websearch",
  version: "1.0.0",
});

server.registerTool(
  "web_search",
  {
    description:
      "Search the web and return title, URL, and snippet entries without fetching page bodies.",
    inputSchema: webSearchSchema,
  },
  handleWebSearch,
);

server.registerTool(
  "fetch_page",
  {
    description:
      "Fetch a URL and return cleaned readable markdown extracted from the main page content.",
    inputSchema: fetchPageSchema,
  },
  handleFetchPage,
);

const transport = new StdioServerTransport();
await server.connect(transport);
