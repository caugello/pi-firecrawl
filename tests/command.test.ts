import { describe, expect, it } from "vitest";
import { parseFirecrawlArgs, USAGE_ERROR } from "../src/command.js";

describe("parseFirecrawlArgs", () => {
  it("defaults to search mode with the config default limit", () => {
    expect(parseFirecrawlArgs("hello world", { limit: 7 })).toEqual({
      mode: "search",
      target: "hello world",
      limit: 7,
      tbs: undefined,
    });
  });

  it("parses flags", () => {
    expect(parseFirecrawlArgs("-n 10 -t qdr:m some query", {})).toEqual({
      mode: "search",
      target: "some query",
      limit: 10,
      tbs: "qdr:m",
    });
  });

  it("parses long flags", () => {
    expect(parseFirecrawlArgs("--limit 3 --tbs qdr:w q", {})).toEqual({
      mode: "search",
      target: "q",
      limit: 3,
      tbs: "qdr:w",
    });
  });

  it("parses scrape and crawl modes with URLs", () => {
    expect(parseFirecrawlArgs("scrape https://x.example/a", {})).toEqual({
      mode: "scrape",
      target: "https://x.example/a",
      limit: undefined,
      tbs: undefined,
    });
    expect(parseFirecrawlArgs("crawl https://x.example/", { limit: 4 })).toEqual({
      mode: "crawl",
      target: "https://x.example/",
      limit: 4,
      tbs: undefined,
    });
  });

  it("throws on empty args", () => {
    expect(() => parseFirecrawlArgs("", {})).toThrow(USAGE_ERROR);
    expect(() => parseFirecrawlArgs("   ", {})).toThrow(USAGE_ERROR);
  });

  it("throws on invalid limit", () => {
    expect(() => parseFirecrawlArgs("-n x q", {})).toThrow(/"limit"/);
    expect(() => parseFirecrawlArgs("-n 0 q", {})).toThrow(/"limit"/);
    expect(() => parseFirecrawlArgs("-n 21 q", {})).toThrow(/"limit"/);
    expect(() => parseFirecrawlArgs("-n q", {})).toThrow(/"limit"/);
  });

  it("throws on missing flag values", () => {
    expect(() => parseFirecrawlArgs("-n", {})).toThrow(/missing value/);
    expect(() => parseFirecrawlArgs("-t", {})).toThrow(/missing value/);
  });

  it("throws when scrape/crawl target is not a http(s) URL", () => {
    expect(() => parseFirecrawlArgs("scrape not-a-url", {})).toThrow(/http\(s\) URL/);
    expect(() => parseFirecrawlArgs("crawl example.com", {})).toThrow(/http\(s\) URL/);
  });

  it("does not treat 'scrape' appearing mid-query as a mode switch", () => {
    expect(parseFirecrawlArgs("how to scrape a site", {})).toEqual({
      mode: "search",
      target: "how to scrape a site",
      limit: undefined,
      tbs: undefined,
    });
  });
});
