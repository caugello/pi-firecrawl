import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { NO_CONFIG_MESSAGE, resolveConfig } from "../src/config.js";

const dirs: string[] = [];
let home: string;
beforeAll(() => {
  // isolate from any real ~/.pi/agent/firecrawl.json on this machine
  home = mkdtempSync(join(tmpdir(), "fc-home-"));
  process.env.HOME = home;
});
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeCwd(cfg: unknown): string {
  const cwd = mkdtempSync(join(tmpdir(), "fc-cfg-"));
  dirs.push(cwd);
  mkdirSync(join(cwd, ".pi"));
  writeFileSync(join(cwd, ".pi", "firecrawl.json"), JSON.stringify(cfg));
  return cwd;
}

describe("resolveConfig", () => {
  it("throws NO_CONFIG_MESSAGE when nothing is configured", () => {
    const cwd = mkdtempSync(join(tmpdir(), "fc-none-"));
    dirs.push(cwd);
    expect(() => resolveConfig(cwd)).toThrow(NO_CONFIG_MESSAGE);
  });

  it("accepts \"key\" as an alias for \"apiKey\"", () => {
    const cwd = makeCwd({ url: "http://fc.internal", key: "abc" });
    expect(resolveConfig(cwd).apiKey).toBe("abc");
  });

  it("reads url + defaults from project config", () => {
    const cwd = makeCwd({ url: "https://firecrawl.example/" });
    expect(resolveConfig(cwd)).toEqual({
      url: "https://firecrawl.example",
      apiPath: "/v1",
      apiKey: undefined,
      limit: 5,
      maxContentChars: 2000,
      maxCrawlPages: 20,
      crawlTimeoutMs: 60_000,
    });
  });

  it("accepts all optional keys", () => {
    const cwd = makeCwd({
      url: "http://fc.internal",
      apiPath: "/v2/",
      apiKey: " secret ",
      limit: 10,
      maxContentChars: 5000,
      maxCrawlPages: 50,
      crawlTimeoutMs: 120_000,
    });
    expect(resolveConfig(cwd)).toEqual({
      url: "http://fc.internal",
      apiPath: "/v2",
      apiKey: "secret",
      limit: 10,
      maxContentChars: 5000,
      maxCrawlPages: 50,
      crawlTimeoutMs: 120_000,
    });
  });

  it("rejects missing/invalid url", () => {
    expect(() => resolveConfig(makeCwd({}))).toThrow(/"url"/);
    expect(() => resolveConfig(makeCwd({ url: "ftp://x" }))).toThrow(/must start with http/);
    expect(() => resolveConfig(makeCwd({ url: "   " }))).toThrow(/"url"/);
  });

  it("rejects invalid optional values", () => {
    expect(() => resolveConfig(makeCwd({ url: "http://x", apiPath: "v1" }))).toThrow(/"apiPath"/);
    expect(() => resolveConfig(makeCwd({ url: "http://x", limit: 0 }))).toThrow(/"limit"/);
    expect(() => resolveConfig(makeCwd({ url: "http://x", limit: 21 }))).toThrow(/"limit"/);
    expect(() => resolveConfig(makeCwd({ url: "http://x", maxContentChars: 10 }))).toThrow(/"maxContentChars"/);
    expect(() => resolveConfig(makeCwd({ url: "http://x", maxCrawlPages: 500 }))).toThrow(/"maxCrawlPages"/);
    expect(() => resolveConfig(makeCwd({ url: "http://x", crawlTimeoutMs: 1 }))).toThrow(/"crawlTimeoutMs"/);
    expect(() => resolveConfig(makeCwd({ url: "http://x", apiKey: "" }))).toThrow(/"apiKey"/);
  });
});
