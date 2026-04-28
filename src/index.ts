import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server.js";

const server = createServer();

const transport = new StdioServerTransport();

process.stderr.write(
  `${[
    "Websearch MCP is running over stdio.",
    "It does not bind to an IP address or port; the client connects through stdin/stdout.",
  ].join("\n")}\n`,
);

await server.connect(transport);
