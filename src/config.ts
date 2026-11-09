import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface FirecrawlSettings {
  url: string;
  apiPath: string;
  apiKey?: string;
  limit: number;
  maxContentChars: number;
  maxCrawlPages: number;
  crawlTimeoutMs: number;
}

export const NO_CONFIG_MESSAGE =
  'no Firecrawl configured (create .pi/firecrawl.json or ~/.pi/agent/firecrawl.json with { "url": "https://firecrawl.example" })';

function fail(key: string, why: string): never {
  throw new Error(`invalid firecrawl.json "${key}": ${why}`);
}

export function resolveConfig(cwd: string): FirecrawlSettings {
  const projectPath = join(cwd, ".pi", "firecrawl.json");
  const globalPath = join(homedir(), ".pi", "agent", "firecrawl.json");

  const path = existsSync(projectPath) ? projectPath : existsSync(globalPath) ? globalPath : null;
  if (!path) throw new Error(NO_CONFIG_MESSAGE);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`invalid firecrawl.json "${path}": ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`invalid firecrawl.json "${path}": expected a JSON object`);
  }
  const obj = raw as Record<string, unknown>;

  if (!("url" in obj) || typeof obj.url !== "string" || obj.url.trim() === "") {
    fail("url", "required non-empty string starting with http:// or https://");
  }
  let url = (obj.url as string).trim();
  if (!/^https?:\/\//.test(url)) fail("url", "must start with http:// or https://");
  url = url.replace(/\/+$/, "");

  let apiPath = "/v1";
  if (obj.apiPath !== undefined) {
    if (typeof obj.apiPath !== "string" || !obj.apiPath.startsWith("/") || obj.apiPath === "/") {
      fail("apiPath", "optional string path starting with / (default /v1)");
    }
    apiPath = obj.apiPath.replace(/\/+$/, "");
  }

  let apiKey: string | undefined;
  const rawKey = obj.apiKey !== undefined ? obj.apiKey : obj.key;
  if (rawKey !== undefined) {
    if (typeof rawKey !== "string" || rawKey.trim() === "") fail("apiKey", "optional non-empty string (accepts \"key\" as alias)");
    apiKey = rawKey.trim();
  }

  let limit = 5;
  if (obj.limit !== undefined) {
    if (typeof obj.limit !== "number" || !Number.isInteger(obj.limit) || obj.limit < 1 || obj.limit > 20) {
      fail("limit", "integer 1..20");
    }
    limit = obj.limit;
  }

  let maxContentChars = 2000;
  if (obj.maxContentChars !== undefined) {
    if (typeof obj.maxContentChars !== "number" || !Number.isInteger(obj.maxContentChars) || obj.maxContentChars < 200 || obj.maxContentChars > 20000) {
      fail("maxContentChars", "integer 200..20000");
    }
    maxContentChars = obj.maxContentChars;
  }

  let maxCrawlPages = 20;
  if (obj.maxCrawlPages !== undefined) {
    if (typeof obj.maxCrawlPages !== "number" || !Number.isInteger(obj.maxCrawlPages) || obj.maxCrawlPages < 1 || obj.maxCrawlPages > 100) {
      fail("maxCrawlPages", "integer 1..100");
    }
    maxCrawlPages = obj.maxCrawlPages;
  }

  let crawlTimeoutMs = 60_000;
  if (obj.crawlTimeoutMs !== undefined) {
    if (typeof obj.crawlTimeoutMs !== "number" || !Number.isInteger(obj.crawlTimeoutMs) || obj.crawlTimeoutMs < 5_000 || obj.crawlTimeoutMs > 300_000) {
      fail("crawlTimeoutMs", "integer 5000..300000");
    }
    crawlTimeoutMs = obj.crawlTimeoutMs;
  }

  return { url, apiPath, apiKey, limit, maxContentChars, maxCrawlPages, crawlTimeoutMs };
}
