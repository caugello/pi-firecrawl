import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import factory from "../extension/index.js";

let server: ReturnType<typeof createServer>;
let base: string;
let isolatedHome: string;

beforeAll(async () => {
  // isolate from any real ~/.pi/agent/firecrawl.json on this machine
  isolatedHome = mkdtempSync(join(tmpdir(), "fc-ext-home-"));
  process.env.HOME = isolatedHome;
  server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url?.endsWith("/search")) {
      res.end(JSON.stringify({
        success: true,
        data: [
          { title: "Firecrawl docs", url: "https://docs.firecrawl.example", description: "Everything about Firecrawl." },
        ],
      }));
    } else if (req.url?.endsWith("/scrape")) {
      res.end(JSON.stringify({
        success: true,
        data: { markdown: "# Firecrawl", metadata: { title: "Firecrawl", sourceURL: "https://firecrawl.example" } },
      }));
    } else if (req.url?.endsWith("/crawl")) {
      res.end(JSON.stringify({ success: true, data: [{ title: "P1", url: "https://site.example/1", markdown: "page one" }] }));
    } else {
      res.end(JSON.stringify({ success: true, data: [] }));
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const dirs: string[] = [];
function makeCwd(cfg?: unknown): string {
  const cwd = mkdtempSync(join(tmpdir(), "fc-ext-"));
  dirs.push(cwd);
  mkdirSync(join(cwd, ".pi"));
  writeFileSync(join(cwd, ".pi", "firecrawl.json"), JSON.stringify(cfg ?? { url: base }));
  return cwd;
}
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  rmSync(isolatedHome, { recursive: true, force: true });
});

function makePi() {
  const tools: any[] = [];
  const commands: Record<string, any> = {};
  const sent: Array<{ content: unknown; options?: unknown }> = [];
  return {
    tools,
    commands,
    sent,
    registerTool: (t: any) => tools.push(t),
    registerCommand: (name: string, c: any) => {
      commands[name] = c;
    },
    sendUserMessage: (content: unknown, options?: unknown) => sent.push({ content, options }),
  };
}

function makeUi() {
  const notified: Array<[string, unknown]> = [];
  return { notified, notify: (m: string, t?: unknown) => notified.push([m, t]), setStatus: () => {} };
}

const toolNames = (pi: ReturnType<typeof makePi>) => pi.tools.map((t) => t.name).sort();

describe("extension factory", () => {
  it("registers firecrawl_search, firecrawl_scrape, firecrawl_crawl tools and /firecrawl command", () => {
    const pi = makePi();
    factory(pi as any);
    expect(toolNames(pi)).toEqual(["firecrawl_crawl", "firecrawl_scrape", "firecrawl_search"]);
    expect(Object.keys(pi.commands)).toEqual(["firecrawl"]);
    const search = pi.tools.find((t) => t.name === "firecrawl_search")!;
    expect(search.promptGuidelines.join(" ")).toContain("curl");
  });

  it("firecrawl_search tool formats results with URLs", async () => {
    const pi = makePi();
    factory(pi as any);
    const search = pi.tools.find((t) => t.name === "firecrawl_search")!;
    const updates: unknown[] = [];
    const onUpdate = (u: unknown) => updates.push(u);
    const out = await search.execute("id", { query: "firecrawl" }, undefined, onUpdate, { cwd: makeCwd() });
    expect(out.details.urls).toEqual(["https://docs.firecrawl.example"]);
    expect((out.content[0] as any).text).toContain("Firecrawl docs");
    expect(updates.length).toBeGreaterThan(0);
  });

  it("firecrawl_scrape tool returns markdown", async () => {
    const pi = makePi();
    factory(pi as any);
    const scrape = pi.tools.find((t) => t.name === "firecrawl_scrape")!;
    const out = await scrape.execute("id", { url: "https://firecrawl.example" }, undefined, undefined, { cwd: makeCwd() });
    expect((out.content[0] as any).text).toContain("# Firecrawl");
  });

  it("firecrawl_crawl tool formats pages", async () => {
    const pi = makePi();
    factory(pi as any);
    const crawl = pi.tools.find((t) => t.name === "firecrawl_crawl")!;
    const out = await crawl.execute("id", { url: "https://site.example", limit: 5 }, undefined, undefined, { cwd: makeCwd() });
    expect((out.content[0] as any).text).toContain("https://site.example/1");
  });

  it("tools report config errors without throwing", async () => {
    const pi = makePi();
    factory(pi as any);
    const search = pi.tools.find((t) => t.name === "firecrawl_search")!;
    const noCfg = mkdtempSync(join(tmpdir(), "fc-nocfg-"));
    dirs.push(noCfg);
    const out = await search.execute("id", { query: "q" }, undefined, undefined, { cwd: noCfg });
    expect(out.details.error).toBe(true);
    expect((out.content[0] as any).text).toContain("no Firecrawl configured");
  });
});

describe("/firecrawl command", () => {
  it("searches and sends results to the conversation", async () => {
    const pi = makePi();
    factory(pi as any);
    const ui = makeUi();
    await pi.commands.firecrawl.handler("firecrawl release notes", { cwd: makeCwd(), ui });
    expect(pi.sent).toHaveLength(1);
    expect(String(pi.sent[0].content)).toContain("https://docs.firecrawl.example");
  });

  it("scrapes when given the scrape subcommand", async () => {
    const pi = makePi();
    factory(pi as any);
    const ui = makeUi();
    await pi.commands.firecrawl.handler("scrape https://firecrawl.example", { cwd: makeCwd(), ui });
    expect(String(pi.sent[0].content)).toContain("# Firecrawl");
  });

  it("notifies on usage errors", async () => {
    const pi = makePi();
    factory(pi as any);
    const ui = makeUi();
    await pi.commands.firecrawl.handler("", { cwd: makeCwd(), ui });
    expect(ui.notified[0][1]).toBe("error");
  });

  it("notifies when config is missing", async () => {
    const pi = makePi();
    factory(pi as any);
    const ui = makeUi();
    const noCfg = mkdtempSync(join(tmpdir(), "fc-nocfg2-"));
    dirs.push(noCfg);
    await pi.commands.firecrawl.handler("q", { cwd: noCfg, ui });
    expect(String(ui.notified[0][0])).toContain("no Firecrawl configured");
  });
});
