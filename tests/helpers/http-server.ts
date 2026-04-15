import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export type TestRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;

export async function withTestServer(
  handler: TestRequestHandler,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch((error) => {
      response.statusCode = 500;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end(error instanceof Error ? error.message : "Unexpected handler error");
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not determine test server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}
