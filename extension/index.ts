import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveConfig } from "../src/config.js";
import { crawlFirecrawl, scrapeFirecrawl, searchFirecrawl } from "../src/client.js";
import { formatCrawlResults, formatScrape, formatSearchResults } from "../src/format.js";
import { parseFirecrawlArgs, USAGE_ERROR } from "../src/command.js";

const CURL_FALLBACK =
  "If fetching a page with curl/read fails (403/anti-bot, JS-rendered, redirect maze, or HTML too messy to parse), retry with firecrawl_scrape.";

function err(e: unknown): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return { content: [{ type: "text", text: `Firecrawl: ${e instanceof Error ? e.message : String(e)}` }], details: { error: true } };
}

export default function firecrawl(pi: ExtensionAPI) {
  pi.registerTool({
    name: "firecrawl_search",
    label: "Firecrawl web search",
    description:
      "Search the live web via a self-hosted Firecrawl server and return LLM-friendly results (title, URL, description). " +
      "Use it whenever the question needs current web information (docs, news, releases, prices, anything after the model's cutoff).",
    promptSnippet: "Search the live web via self-hosted Firecrawl",
    promptGuidelines: [
      "Use firecrawl_search when the user asks anything requiring live web information, current events, or pages newer than your knowledge.",
      CURL_FALLBACK,
      "Pass -t/tbs for recency (qdr:d day, qdr:w week, qdr:m month, qdr:y year) when freshness matters.",
      "Results are search hits with URLs \u2014 synthesize the answer and cite the URLs; follow up with firecrawl_scrape if a result's snippet is not enough.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query, phrased like a web search." }),
      limit: Type.Optional(Type.Number({ description: "Max results (1-20)." })),
      tbs: Type.Optional(Type.String({ description: "Google-style time filter: qdr:d, qdr:w, qdr:m, qdr:y." })),
    }),
    async execute(_id, params, _signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: "Firecrawl: searching\u2026" }], details: {} });
      try {
        const settings = resolveConfig(ctx?.cwd ?? process.cwd());
        const results = await searchFirecrawl(settings, { query: params.query, limit: params.limit, tbs: params.tbs });
        return {
          content: [{ type: "text", text: formatSearchResults({ query: params.query, limit: params.limit, tbs: params.tbs }, results) }],
          details: { numResults: results.length, urls: results.map((r) => r.url) },
        };
      } catch (e) {
        return err(e);
      }
    },
  });

  pi.registerTool({
    name: "firecrawl_scrape",
    label: "Firecrawl scrape URL",
    description:
      "Scrape a single URL via a self-hosted Firecrawl server and return clean main-content markdown (title, URL, description). " +
      "Use it for JS-heavy pages, anti-bot blocks, or any URL where plain HTTP fetching fails or returns unusable HTML.",
    promptSnippet: "Scrape any URL to clean markdown via Firecrawl (fallback when curl fails)",
    promptGuidelines: [CURL_FALLBACK],
    parameters: Type.Object({
      url: Type.String({ description: "http(s) URL to scrape." }),
    }),
    async execute(_id, params, _signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: "Firecrawl: scraping\u2026" }], details: {} });
      try {
        const settings = resolveConfig(ctx?.cwd ?? process.cwd());
        const result = await scrapeFirecrawl(settings, params.url);
        return { content: [{ type: "text", text: formatScrape(result) }], details: { url: result.url } };
      } catch (e) {
        return err(e);
      }
    },
  });

  pi.registerTool({
    name: "firecrawl_crawl",
    label: "Firecrawl crawl site",
    description:
      "Crawl multiple pages of a site via a self-hosted Firecrawl server and return per-page markdown excerpts. " +
      "Use it when the answer spans many pages of one site (docs, changelogs, sitemaps) and scraping page-by-page is too slow.",
    promptSnippet: "Crawl a whole site via self-hosted Firecrawl",
    promptGuidelines: [
      "Prefer firecrawl_crawl over many firecrawl_scrape calls when you'd need 5+ pages from the same host.",
      "Set limit to the number of pages you actually need (capped by maxCrawlPages in firecrawl.json).",
      "Crawling can take up to the configured crawlTimeoutMs; prefer a tighter limit for speed.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "Root http(s) URL of the site/section to crawl." }),
      limit: Type.Optional(Type.Number({ description: "Max pages to return (1-100)." })),
    }),
    async execute(_id, params, _signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: "Firecrawl: crawling\u2026" }], details: {} });
      try {
        const settings = resolveConfig(ctx?.cwd ?? process.cwd());
        const results = await crawlFirecrawl(settings, { url: params.url, limit: params.limit }, {
          onProgress: (status) => onUpdate?.({ content: [{ type: "text", text: `Firecrawl: crawl ${status}\u2026` }], details: {} }),
        });
        return {
          content: [{ type: "text", text: formatCrawlResults({ url: params.url, limit: params.limit }, results) }],
          details: { numPages: results.length, urls: results.map((r) => r.url) },
        };
      } catch (e) {
        return err(e);
      }
    },
  });

  pi.registerCommand("firecrawl", {
    description: "Firecrawl web search/scrape/crawl: /firecrawl [-n limit] [-t tbs] <query> | /firecrawl scrape|crawl <url>",
    async handler(args: string, ctx: any) {
      let settings;
      try {
        settings = resolveConfig(ctx.cwd);
      } catch (e) {
        ctx.ui?.notify?.(e instanceof Error ? e.message : String(e), "error");
        return;
      }
      let parsed;
      try {
        parsed = parseFirecrawlArgs(args, { limit: settings.limit });
      } catch (e) {
        ctx.ui?.notify?.(e instanceof Error ? e.message : USAGE_ERROR, "error");
        return;
      }
      ctx.ui?.setStatus?.("firecrawl", `Firecrawl ${parsed.mode}\u2026`);
      try {
        let text: string;
        if (parsed.mode === "search") {
          const results = await searchFirecrawl(settings, { query: parsed.target, limit: parsed.limit, tbs: parsed.tbs });
          text = formatSearchResults({ query: parsed.target, limit: parsed.limit, tbs: parsed.tbs }, results);
        } else if (parsed.mode === "scrape") {
          text = formatScrape(await scrapeFirecrawl(settings, parsed.target));
        } else {
          const results = await crawlFirecrawl(settings, { url: parsed.target, limit: parsed.limit }, {
            onProgress: (status) => ctx.ui?.setStatus?.("firecrawl", `Firecrawl crawl ${status}\u2026`),
          });
          text = formatCrawlResults({ url: parsed.target, limit: parsed.limit }, results);
        }
        ctx.ui?.notify?.(`Firecrawl: ${parsed.mode} done \u2014 sent to the conversation.`, "info");
        const idle = typeof ctx?.isIdle === "function" ? ctx.isIdle() : true;
        if (idle) pi.sendUserMessage(text);
        else pi.sendUserMessage(text, { deliverAs: "followUp" });
      } catch (e) {
        ctx.ui?.notify?.(e instanceof Error ? e.message : String(e), "error");
      } finally {
        ctx.ui?.setStatus?.("firecrawl", undefined);
      }
    },
  });
}
