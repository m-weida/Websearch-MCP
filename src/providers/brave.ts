export type SearchResult = {
  title: string;
  url: string;
  description: string;
};

export class BraveSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BraveSearchError";
  }
}

type BraveApiResult = {
  title?: string;
  url?: string;
  description?: string;
};

type BraveApiResponse = {
  web?: {
    results?: BraveApiResult[];
  };
};

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

function getBraveEndpoint(): string {
  return process.env.BRAVE_ENDPOINT?.trim() || BRAVE_ENDPOINT;
}

export async function searchWithBrave(
  query: string,
  count: number,
  apiKey: string | undefined,
): Promise<SearchResult[]> {
  if (!apiKey) {
    throw new BraveSearchError("Missing BRAVE_API_KEY");
  }

  const url = new URL(getBraveEndpoint());
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Subscription-Token": apiKey,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    throw new BraveSearchError(`Brave request failed: ${message}`);
  }

  if (!response.ok) {
    throw new BraveSearchError(`Brave request failed with HTTP ${response.status}`);
  }

  let payload: BraveApiResponse;
  try {
    payload = (await response.json()) as BraveApiResponse;
  } catch {
    throw new BraveSearchError("Brave returned invalid JSON");
  }

  const results = payload.web?.results ?? [];
  return results
    .map((item) => ({
      title: item.title?.trim() ?? "Untitled",
      url: item.url?.trim() ?? "",
      description: item.description?.trim() ?? "No description provided.",
    }))
    .filter((item) => item.url.length > 0)
    .slice(0, count);
}
