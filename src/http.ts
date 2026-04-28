import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createServer } from "./server.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_CORS_ORIGIN = "*";
const CORS_ALLOWED_METHODS = "POST, OPTIONS";
const CORS_ALLOWED_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "mcp-protocol-version",
  "mcp-session-id",
].join(", ");
const CORS_EXPOSE_HEADERS = ["mcp-protocol-version", "mcp-session-id"].join(", ");

function parsePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid MCP_HTTP_PORT: ${value}`);
  }

  return parsed;
}

function writeJsonRpcError(
  response: ServerResponse,
  statusCode: number,
  code: number,
  message: string,
): void {
  if (response.headersSent) {
    return;
  }

  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
  );
}

function getCorsOrigins(): string[] {
  const raw = process.env.MCP_HTTP_CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN;
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function resolveCorsOrigin(request: IncomingMessage, allowedOrigins: string[]): string | undefined {
  const origin = request.headers.origin;
  if (!origin || allowedOrigins.length === 0) {
    return undefined;
  }

  if (allowedOrigins.includes("*")) {
    return "*";
  }

  if (allowedOrigins.includes(origin)) {
    return origin;
  }

  return undefined;
}

function applyCorsHeaders(response: ServerResponse, origin: string | undefined): void {
  if (!origin) {
    return;
  }

  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-methods", CORS_ALLOWED_METHODS);
  response.setHeader("access-control-allow-headers", CORS_ALLOWED_HEADERS);
  response.setHeader("access-control-expose-headers", CORS_EXPOSE_HEADERS);
  response.setHeader("access-control-max-age", "600");

  if (origin !== "*") {
    response.setHeader("vary", "origin");
  }
}

async function readJsonBody(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<unknown | undefined> {
  const chunks: Buffer[] = [];

  try {
    for await (const chunk of request) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
  } catch (error) {
    writeJsonRpcError(
      response,
      400,
      -32700,
      error instanceof Error ? error.message : "Failed to read request body.",
    );
    return undefined;
  }

  const bodyText = Buffer.concat(chunks).toString("utf8").trim();
  if (!bodyText) {
    writeJsonRpcError(response, 400, -32700, "Missing JSON body.");
    return undefined;
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch (error) {
    writeJsonRpcError(
      response,
      400,
      -32700,
      error instanceof Error ? error.message : "Invalid JSON body.",
    );
    return undefined;
  }
}

const host = (process.env.MCP_HTTP_HOST ?? DEFAULT_HOST).trim() || DEFAULT_HOST;
let port = DEFAULT_PORT;

try {
  port = parsePort(process.env.MCP_HTTP_PORT);
} catch (error) {
  const message = error instanceof Error ? error.message : "Invalid MCP_HTTP_PORT.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const allowedCorsOrigins = getCorsOrigins();

const server = createHttpServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}`);
  const corsOrigin = resolveCorsOrigin(request, allowedCorsOrigins);

  applyCorsHeaders(response, corsOrigin);

  if (url.pathname !== "/mcp") {
    response.statusCode = 404;
    response.end("Not Found");
    return;
  }

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== "POST") {
    writeJsonRpcError(response, 405, -32000, "Method not allowed.");
    return;
  }

  const body = await readJsonBody(request, response);
  if (body === undefined) {
    return;
  }

  const mcpServer = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  response.once("close", () => {
    transport.close();
    mcpServer.close();
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(request, response, body);
  } catch (error) {
    process.stderr.write(`Error handling MCP request: ${error}\n`);
    writeJsonRpcError(response, 500, -32603, "Internal server error");
  }
});

server.on("error", (error) => {
  process.stderr.write(`Failed to start HTTP server: ${error}\n`);
  process.exit(1);
});

server.listen(port, host, () => {
  process.stderr.write(`MCP Streamable HTTP server listening on http://${host}:${port}/mcp\n`);
});

process.on("SIGINT", () => {
  process.stderr.write("Shutting down HTTP server...\n");
  server.close(() => {
    process.stderr.write("HTTP server shutdown complete.\n");
    process.exit(0);
  });
});
