# pi-firecrawl

A [pi](https://pi.dev) coding-agent extension that gives the model **live web access via a self-hosted [Firecrawl](https://firecrawl.dev)** — web search, single-URL scraping to clean markdown, and whole-site crawls. No LLM involved; plain Firecrawl REST calls.

- **`firecrawl_search` tool** — web search with LLM-friendly results. The model reaches for it whenever a question needs live web info (docs, news, releases, prices, anything past its cutoff).
- **`firecrawl_scrape` tool** — scrape one URL to main-content markdown. The model is told to use this as the fallback whenever fetching with curl/read fails (403/anti-bot, JS-rendered, unusable HTML).
- **`firecrawl_crawl` tool** — crawl many pages of one site (docs, changelogs) with per-page markdown excerpts; prefers this over 5+ scrapes on the same host. Handles both synchronous and job-based (async poll) crawl deployments.
- **`/firecrawl` command** — deterministic direct use:

  ```
  /firecrawl openshift 4.19 release notes
  /firecrawl -t qdr:m -n 10 rust async traits
  /firecrawl scrape https://firecrawl.dev
  /firecrawl crawl https://docs.firecrawl.dev
  ```

## Setup

Point the extension at your Firecrawl server. Global config `~/.pi/agent/firecrawl.json`:

```json
{ "url": "https://firecrawl.example", "key": "fc-..." }
```

Project override: `<project>/.pi/firecrawl.json` (wins over global).

Keys: `url` (required), `key` or `apiKey` (sent as `Authorization: Bearer …`; optional for an open self-host), `apiPath` (default `/v1`), `limit` (search results, 1–20, default 5), `maxContentChars` (excerpt cap, 200–20000, default 2000), `maxCrawlPages` (1–100, default 20), `crawlTimeoutMs` (poll deadline for async crawls, 5000–300000, default 60000).

Install the built extension for pi (dev or global):

```bash
npm run build
ln -sfn "$PWD/dist/firecrawl.ts" ~/.pi/agent/extensions/firecrawl.ts   # then /reload in pi
```

or per project: copy `extension/` + `src/` into `<project>/.pi/extensions/firecrawl/`.

## Endpoints used (verified against a live self-hosted Firecrawl)

- `POST /v1/search` → `{ query, limit, tbs }` — synchronous results with `title/url/description`
- `POST /v1/scrape` → `{ url, formats: ["markdown"], onlyMainContent: true }` — markdown + metadata (newlines preserved)
- `POST /v1/crawl` → `{ url, limit }` — returns pages directly (sync deployments) or a job `id`; async jobs are polled via `GET /v1/crawl/{id}` until `status: "completed"`

Quirks handled: non-JSON responses reported clearly (misconfigured URL), `{ success: false, error }` surfaced verbatim, scrape missing markdown detected, crawl jobs without an id rejected, 0-result and timeout cases never throw raw.

## Development

```bash
npm test          # vitest suite, fully offline (mock Firecrawl server)
npm run typecheck # strict TS
npm run build     # esbuild → dist/firecrawl.ts (externals: typebox, pi)
```

## Layout

```
src/config.ts     resolveConfig(cwd): project .pi/firecrawl.json > ~/.pi/agent/firecrawl.json, validation
src/client.ts    searchFirecrawl/scrapeFirecrawl/crawlFirecrawl: REST + async-job polling
src/format.ts    formatSearchResults/formatScrape/formatCrawlResults (pure)
src/command.ts   parseFirecrawlArgs: scrape|crawl subcommands, -n limit, -t tbs (pure)
extension/index.ts pi glue: 3 tools + /firecrawl command (sendUserMessage, notify, status)
dist/firecrawl.ts esbuild bundle for global install
tests/            vitest suite incl. extension glue against a local mock Firecrawl server
```
