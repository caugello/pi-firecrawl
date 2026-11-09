import type { FirecrawlSettings } from "./config.js";

const TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;
const TRUNCATION_MARKER = "\u2026[truncated]";

export interface SearchQuery {
  query: string;
  limit?: number;
  tbs?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  description?: string;
  markdown?: string;
}

export interface ScrapeResult {
  title?: string;
  url: string;
  description?: string;
  markdown: string;
}

export interface CrawlQuery {
  url: string;
  limit?: number;
}

export class FirecrawlError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function cap(text: string | undefined, max: number): string | undefined {
  if (text === undefined) return undefined;
  return text.length > max ? text.slice(0, max) + TRUNCATION_MARKER : text;
}

function capCollapsed(text: string | undefined, max: number): string | undefined {
  if (text === undefined) return undefined;
  const collapsed = text.replace(/\s+/g, " ").trim();
  return cap(collapsed, max);
}

function headers(settings: FirecrawlSettings): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (settings.apiKey) h.authorization = `Bearer ${settings.apiKey}`;
  return h;
}

function endpoint(settings: FirecrawlSettings, path: string): string {
  return `${settings.url}${settings.apiPath}${path}`;
}

async function requestJson(
  settings: FirecrawlSettings,
  path: string,
  body: unknown,
  signal?: AbortSignal,
  method: "GET" | "POST" = "POST",
): Promise<any> {
  let res: Response;
  try {
    res = await fetch(endpoint(settings, path), {
      method,
      headers: headers(settings),
      body: method === "POST" ? JSON.stringify(body) : undefined,
      signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new FirecrawlError(`cannot reach Firecrawl at ${settings.url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FirecrawlError(`Firecrawl returned non-JSON (HTTP ${res.status}) at ${settings.url} — is this the Firecrawl server?`, res.status);
  }
  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : typeof json?.message === "string" ? json.message : `HTTP ${res.status}`;
    throw new FirecrawlError(`Firecrawl error: ${msg}`, res.status);
  }
  if (json?.success === false) {
    throw new FirecrawlError(`Firecrawl reported failure: ${typeof json?.error === "string" ? json.error : "unknown error"}`);
  }
  return json;
}

export async function searchFirecrawl(
  settings: FirecrawlSettings,
  q: SearchQuery,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const body: Record<string, unknown> = {
    query: q.query,
    limit: q.limit ?? settings.limit,
  };
  if (q.tbs) body.tbs = q.tbs;
  const json = await requestJson(settings, "/search", body, signal);
  const data = Array.isArray(json?.data) ? json.data : [];
  return data.map((d: any): SearchResult => ({
    title: typeof d?.title === "string" ? d.title : "",
    url: typeof d?.url === "string" ? d.url : "",
    description: capCollapsed(typeof d?.description === "string" ? d.description : undefined, settings.maxContentChars),
    markdown: cap(typeof d?.markdown === "string" ? d.markdown : undefined, settings.maxContentChars),
  })).filter((r: SearchResult) => r.url);
}

export async function scrapeFirecrawl(
  settings: FirecrawlSettings,
  url: string,
  signal?: AbortSignal,
): Promise<ScrapeResult> {
  const json = await requestJson(
    settings,
    "/scrape",
    { url, formats: ["markdown"], onlyMainContent: true },
    signal,
  );
  const d = json?.data ?? {};
  const markdown = typeof d?.markdown === "string" ? d.markdown : "";
  if (!markdown) throw new FirecrawlError("Firecrawl scrape returned no markdown content");
  return {
    title: typeof d?.metadata?.title === "string" ? d.metadata.title : undefined,
    url: typeof d?.metadata?.sourceURL === "string" ? d.metadata.sourceURL : url,
    description: capCollapsed(typeof d?.metadata?.description === "string" ? d.metadata.description : undefined, settings.maxContentChars),
    markdown: cap(markdown, 20 * settings.maxContentChars) ?? "",
  };
}

export async function crawlFirecrawl(
  settings: FirecrawlSettings,
  q: CrawlQuery,
  opts?: { signal?: AbortSignal; onProgress?: (status: string) => void; pollIntervalMs?: number },
): Promise<SearchResult[]> {
  const limit = q.limit ?? settings.maxCrawlPages;
  const started = await requestJson(settings, "/crawl", { url: q.url, limit }, opts?.signal);

  // Synchronous deployments return the pages immediately.
  if (Array.isArray(started?.data)) return mapPages(started.data, settings);

  // Asynchronous deployments return a job id to poll.
  const id = started?.id;
  if (typeof id !== "string" || id === "") throw new FirecrawlError("Firecrawl crawl returned neither data nor a job id");

  const deadline = Date.now() + settings.crawlTimeoutMs;
  const interval = opts?.pollIntervalMs ?? POLL_INTERVAL_MS;
  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) throw new FirecrawlError("crawl aborted");
    await new Promise((r) => setTimeout(r, interval));
    const json = await requestJson(settings, `/crawl/${encodeURIComponent(id)}`, undefined, opts?.signal, "GET");
    const status = typeof json?.status === "string" ? json.status : "";
    opts?.onProgress?.(status || "scraping\u2026");
    if (status === "completed" || Array.isArray(json?.data)) {
      return mapPages(Array.isArray(json?.data) ? json.data : [], settings);
    }
    if (status === "failed") throw new FirecrawlError("Firecrawl crawl job failed");
  }
  throw new FirecrawlError(`crawl did not finish within ${settings.crawlTimeoutMs}ms — raise crawlTimeoutMs in firecrawl.json`);
}

function mapPages(data: any[], settings: FirecrawlSettings): SearchResult[] {
  return data
    .map((d: any): SearchResult => ({
      title: typeof d?.title === "string" ? d.title : "",
      url: typeof d?.url === "string" ? d.url : typeof d?.metadata?.sourceURL === "string" ? d.metadata.sourceURL : "",
      description: capCollapsed(typeof d?.description === "string" ? d.description : undefined, settings.maxContentChars),
      markdown: cap(typeof d?.markdown === "string" ? d.markdown : undefined, settings.maxContentChars),
    }))
    .filter((r) => r.url);
}
