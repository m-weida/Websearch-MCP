# Websearch MCP

TypeScript MCP server that exposes two tools over stdio (with optional Streamable HTTP in dev):

- `web_search`: returns web search results (title, URL, snippet)
- `fetch_page`: fetches a URL and returns cleaned readable Markdown

The server is designed for MCP clients like GitHub Copilot in VS Code.

## Prerequisites

- Node.js 22+
- pnpm
- macOS, Linux, or Windows shell environment

## Developer Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create your local env file:

```bash
cp .env.example .env
```

3. Set env values in `.env`:

- `BRAVE_API_KEY=` (optional if you use DuckDuckGo or auto fallback)
- `SEARCH_PROVIDER=brave` (`brave`, `duckduckgo`, or `auto`)
- `FETCH_TIMEOUT_MS=8000`
- `SEARCH_RESULT_COUNT=5`
- `MCP_HTTP_HOST=127.0.0.1` (used by `pnpm dev:http`)
- `MCP_HTTP_PORT=3000` (used by `pnpm dev:http`)
- `MCP_HTTP_CORS_ORIGIN=*` (comma-separated allowlist for browser clients)

## Dev Workflow

Run the server directly from TypeScript during development:

```bash
pnpm dev
```

`pnpm dev` starts the MCP server over stdio, so there is no IP address or TCP port to connect to. The startup banner in the terminal will say that the server is connected through stdin/stdout.

Run the server over Streamable HTTP during development:

```bash
pnpm dev:http
```

`pnpm dev:http` listens on `http://127.0.0.1:3000/mcp` by default. Override with `MCP_HTTP_HOST` and `MCP_HTTP_PORT`. If you are connecting from a browser origin (like `http://127.0.0.1:8080`), set `MCP_HTTP_CORS_ORIGIN` to `*` or a comma-separated list of allowed origins.

Available scripts:

| Command             | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `pnpm dev`          | Run MCP server from `src/index.ts` using `tsx` and `.env` |
| `pnpm dev:http`     | Run Streamable HTTP server from `src/http.ts`             |
| `pnpm lint`         | Run Biome checks on `src`                                 |
| `pnpm test`         | Run test suite (`tests/**/*.test.ts`)                     |
| `pnpm test:watch`   | Run tests in watch mode                                   |
| `pnpm build`        | Compile TypeScript into `dist`                            |
| `pnpm docker:build` | Build Docker image `websearch-mcp`                        |
| `pnpm docker:save`  | Export gzipped Docker image archive                       |
| `pnpm docker:push`  | Push image to GHCR (update namespace first)               |

Typical local loop:

```bash
pnpm lint
pnpm test
pnpm build
```

## Usage Setup (VS Code MCP)

### 1. Build the server

The VS Code MCP config runs the compiled server from `dist`:

```bash
pnpm build
```

### 2. Configure MCP server

This workspace already includes `.vscode/mcp.json`:

```json
{
  "servers": {
    "websearch": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"],
      "env": {
        "BRAVE_API_KEY": "${input:braveApiKey}",
        "SEARCH_PROVIDER": "auto"
      }
    }
  }
}
```

If you do not want to use Brave, set `SEARCH_PROVIDER` to `duckduckgo` or keep `auto` without `BRAVE_API_KEY`.

### 3. Reload MCP/Copilot session

After changing server code:

1. Run `pnpm build`
2. Restart/reload the MCP client session in VS Code

## Tool Behavior

### `web_search`

Input:

- `query` (string, required)
- `count` (number, optional, min 1, max 10)
- `provider` (`brave` | `duckduckgo` | `auto`, optional)

Behavior:

- `auto` tries Brave first when `BRAVE_API_KEY` is set
- on Brave failure in `auto`, it falls back to DuckDuckGo
- returns a plain text list of result blocks

### Runtime Address

- `pnpm dev` connects over stdio (no IP address or port).
- `pnpm dev:http` listens on `http://127.0.0.1:3000/mcp` by default.

### `fetch_page`

Input:

- `url` (string URL, required)
- `maxLength` (number, optional, min 500, max 20000)

Behavior:

- fetches HTML with timeout
- extracts readable article content via Readability
- converts to Markdown
- truncates at a paragraph boundary when needed
- returns a formatted text block with title, source, and content

## Docker (Optional)

Build image:

```bash
pnpm docker:build
```

Run image as stdio process:

```bash
docker run --rm -i \
  -e BRAVE_API_KEY="your_key" \
  -e SEARCH_PROVIDER="auto" \
  websearch-mcp
```

## Project Layout

```text
src/
  index.ts
  http.ts
  server.ts
  providers/
    brave.ts
    duckduckgo.ts
  tools/
    search.ts
    fetch.ts
  utils/
    extract.ts
tests/
  search.test.ts
  fetch.test.ts
```
