import { describe, expect, it } from "vitest";
import { formatCrawlResults, formatScrape, formatSearchResults } from "../src/format.js";

describe("formatSearchResults", () => {
  it("formats hits with title, url, description", () => {
    const text = formatSearchResults({ query: "openshift" }, [
      { title: "OpenShift docs", url: "https://docs.example", description: "All about OpenShift." },
      { title: "Blog", url: "https://blog.example", description: undefined },
    ]);
    expect(text).toContain('Firecrawl search: "openshift" — 2 result(s)');
    expect(text).toContain("1. OpenShift docs");
    expect(text).toContain("   https://docs.example");
    expect(text).toContain("   All about OpenShift.");
    expect(text).toContain("2. Blog");
  });

  it("mentions tbs when set", () => {
    const text = formatSearchResults({ query: "q", tbs: "qdr:m" }, [{ title: "t", url: "https://x" }]);
    expect(text).toContain("(tbs: qdr:m)");
  });

  it("returns no-results line when empty", () => {
    expect(formatSearchResults({ query: "q" }, [])).toBe("Firecrawl: no results.");
  });
});

describe("formatScrape", () => {
  it("formats title, url, and markdown", () => {
    const text = formatScrape({ title: "Page", url: "https://x.example", description: "d", markdown: "# hi\nbody" });
    expect(text).toContain("Firecrawl scrape: Page");
    expect(text).toContain("   https://x.example");
    expect(text).toContain("# hi\nbody");
  });
});

describe("formatCrawlResults", () => {
  it("formats pages with excerpt", () => {
    const text = formatCrawlResults({ url: "https://site.example" }, [
      { title: "A", url: "https://site.example/a", markdown: "page a text" },
      { title: "B", url: "https://site.example/b" },
    ]);
    expect(text).toContain("Firecrawl crawl: https://site.example — 2 page(s)");
    expect(text).toContain("   page a text");
  });

  it("returns no-results line when empty", () => {
    expect(formatCrawlResults({ url: "https://x" }, [])).toBe("Firecrawl: no results.");
  });
});
