export const USAGE_ERROR =
  "usage: /firecrawl <query> | /firecrawl scrape <url> | /firecrawl crawl <url>  (flags: -n limit, -t tbs e.g. qdr:m, qdr:w, qdr:y)";

export type FirecrawlMode = "search" | "scrape" | "crawl";

export interface FirecrawlArgs {
  mode: FirecrawlMode;
  target: string;
  limit?: number;
  tbs?: string;
}

export function parseFirecrawlArgs(args: string, defaults: { limit?: number }): FirecrawlArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let mode: FirecrawlMode | undefined;
  const target: string[] = [];
  let limit = defaults.limit;
  let tbs: string | undefined;

  const setLimit = (v: string) => {
    if (!/^\d+$/.test(v)) throw new Error('invalid "limit" (expected integer 1..20)');
    const n = parseInt(v, 10);
    if (n < 1 || n > 20) throw new Error('invalid "limit" (expected integer 1..20)');
    limit = n;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-n" || t === "--limit") {
      if (i + 1 >= tokens.length) throw new Error('missing value for "limit"');
      setLimit(tokens[++i]);
    } else if (t === "-t" || t === "--tbs") {
      if (i + 1 >= tokens.length) throw new Error('missing value for "tbs"');
      tbs = tokens[++i];
    } else if (t === "scrape" && target.length === 0 && !mode) {
      mode = "scrape";
    } else if (t === "crawl" && target.length === 0 && !mode) {
      mode = "crawl";
    } else {
      target.push(t);
    }
  }

  const joined = target.join(" ");
  if (!joined) throw new Error(USAGE_ERROR);
  const finalMode: FirecrawlMode = mode ?? "search";
  if (finalMode !== "search" && !/^https?:\/\//.test(joined)) {
    throw new Error(`${finalMode} expects a http(s) URL, got "${joined}"`);
  }
  return { mode: finalMode, target: joined, limit, tbs };
}
