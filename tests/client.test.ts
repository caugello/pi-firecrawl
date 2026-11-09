import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crawlFirecrawl, scrapeFirecrawl, searchFirecrawl } from "../src/client.js";
import type { FirecrawlSettings } from "../src/config.js";

// Each scenario gets its own apiPath prefix; the client appends the endpoint
// path, so full URLs look like /<prefix>/search, /<prefix>/scrape, /<prefix>/crawl.

let server: ReturnType<typeof createServer>;
let base: string;
let lastAuth: string | undefined;
let lastBody: Record<string, unknown> | undefined;
let crawlGets = 0;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    lastAuth = req.headers.authorization;
    if (req.method === "POST") lastBody = JSON.parse((await readBody(req!)) || "{}");
    const url = req.url ?? "";

    if (url === "/ok/search") {
      json(res, 200, {
        success: true,
        data: [
          { title: "Result 1", url: "https://a.example", description: "first result" },
          { title: "Result 2", url: "https://b.example", description: undefined },
        ],
      });
    } else if (url === "/empty/search") {
      json(res, 200, { success: true, data: [] });
    } else if (url === "/err/search") {
      json(res, 502, { success: false, error: "upstream search provider failed" });
    } else if (url === "/html/search") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html>not json</html>");
    } else if (url === "/ok/scrape") {
      json(res, 200, {
        success: true,
        data: { markdown: "# Page\ncontent", metadata: { title: "Page", sourceURL: "https://a.example", description: "desc" } },
      });
    } else if (url === "/nomd/scrape") {
      json(res, 200, { success: true, data: { metadata: { sourceURL: "https://x" } } });
    } else if (url === "/sync/crawl") {
      json(res, 200, { success: true, data: [{ title: "S1", url: "https://s.example" }] });
    } else if (url === "/async/crawl") {
      json(res, 200, { success: true, id: "job-123", status: "scraping" });
    } else if (url === "/async/crawl/job-123") {
      crawlGets++;
      json(res, 200, crawlGets >= 2
        ? { success: true, status: "completed", data: [{ title: "C1", url: "https://c.example/1", markdown: "one" }] }
        : { success: true, status: "scraping" });
    } else if (url === "/noid/crawl") {
      json(res, 200, { success: true, status: "scraping" });
    } else {
      json(res, 404, { error: "unknown route" });
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const defaults = {
  apiKey: "tok" as string | undefined,
  limit: 5,
  maxContentChars: 200,
  maxCrawlPages: 20,
  crawlTimeoutMs: 60_000,
};

const s = (path: string): FirecrawlSettings => ({ ...defaults, url: base, apiPath: path });

describe("searchFirecrawl", () => {
  it("POSTs query/limit/tbs with Bearer auth and maps results", async () => {
    const results = await searchFirecrawl(s("/ok"), { query: "openshift 4.19", limit: 2, tbs: "qdr:m" });
    expect(lastBody).toEqual({ query: "openshift 4.19", limit: 2, tbs: "qdr:m" });
    expect(lastAuth).toBe("Bearer tok");
    expect(results).toEqual([
      { title: "Result 1", url: "https://a.example", description: "first result", markdown: undefined },
      { title: "Result 2", url: "https://b.example", description: undefined, markdown: undefined },
    ]);
  });

  it("omits tbs when not given and uses config limit", async () => {
    await searchFirecrawl(s("/ok"), { query: "q" });
    expect(lastBody).toEqual({ query: "q", limit: 5 });
  });

  it("surfaces API errors", async () => {
    await expect(searchFirecrawl(s("/err"), { query: "q" })).rejects.toThrow(/upstream search provider failed/);
  });

  it("reports non-JSON responses clearly", async () => {
    await expect(searchFirecrawl(s("/html"), { query: "q" })).rejects.toThrow(/non-JSON/);
  });

  it("returns [] when data is empty", async () => {
    expect(await searchFirecrawl(s("/empty"), { query: "q" })).toEqual([]);
  });
});

describe("scrapeFirecrawl", () => {
  it("scrapes to markdown with metadata, newlines preserved", async () => {
    const result = await scrapeFirecrawl(s("/ok"), "https://a.example");
    expect(lastBody).toEqual({ url: "https://a.example", formats: ["markdown"], onlyMainContent: true });
    expect(result).toEqual({ title: "Page", url: "https://a.example", description: "desc", markdown: "# Page\ncontent" });
  });

  it("throws when no markdown comes back", async () => {
    await expect(scrapeFirecrawl(s("/nomd"), "https://x")).rejects.toThrow(/no markdown/);
  });
});

describe("crawlFirecrawl", () => {
  it("uses synchronous data when the server returns it immediately", async () => {
    const pages = await crawlFirecrawl(s("/sync"), { url: "https://s.example" });
    expect(pages).toEqual([{ title: "S1", url: "https://s.example", description: undefined, markdown: undefined }]);
  });

  it("polls an async job until completed", async () => {
    crawlGets = 0;
    const statuses: string[] = [];
    const pages = await crawlFirecrawl(s("/async"), { url: "https://c.example" }, {
      pollIntervalMs: 5,
      onProgress: (st) => statuses.push(st),
    });
    expect(lastBody).toEqual({ url: "https://c.example", limit: 20 });
    expect(pages).toEqual([{ title: "C1", url: "https://c.example/1", description: undefined, markdown: "one" }]);
    expect(crawlGets).toBe(2);
    expect(statuses).toContain("scraping");
  });

  it("passes a page limit", async () => {
    await crawlFirecrawl(s("/sync"), { url: "https://s.example", limit: 3 });
    expect(lastBody).toEqual({ url: "https://s.example", limit: 3 });
  });

  it("throws when the job has no id and no data", async () => {
    await expect(crawlFirecrawl(s("/noid"), { url: "https://x" })).rejects.toThrow(/neither data nor a job id/);
  });
});
