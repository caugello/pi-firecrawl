import type { CrawlQuery, ScrapeResult, SearchQuery, SearchResult } from "./client.js";

const NONE = "Firecrawl: no results.";

export function formatSearchResults(query: SearchQuery, results: SearchResult[]): string {
  if (results.length === 0) return NONE;
  const header = `Firecrawl search: "${query.query}"${query.tbs ? ` (tbs: ${query.tbs})` : ""} \u2014 ${results.length} result(s)\n`;
  const lines = results.map((r, i) => {
    const bits = [`${i + 1}. ${r.title || "(untitled)"}`];
    bits.push(`   ${r.url}`);
    if (r.description) bits.push(`   ${r.description}`);
    return bits.join("\n");
  });
  return header + lines.join("\n\n");
}

export function formatScrape(result: ScrapeResult): string {
  const bits = [`Firecrawl scrape: ${result.title || "(untitled)"}`, `   ${result.url}`];
  if (result.description) bits.push(`   ${result.description}`);
  bits.push("", result.markdown);
  return bits.join("\n");
}

export function formatCrawlResults(query: CrawlQuery, results: SearchResult[]): string {
  if (results.length === 0) return NONE;
  const header = `Firecrawl crawl: ${query.url} \u2014 ${results.length} page(s)\n`;
  const lines = results.map((r, i) => {
    const bits = [`${i + 1}. ${r.title || "(untitled)"}`];
    bits.push(`   ${r.url}`);
    if (r.markdown) bits.push(`   ${r.markdown}`);
    return bits.join("\n");
  });
  return header + lines.join("\n\n");
}
