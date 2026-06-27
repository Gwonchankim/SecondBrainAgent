// Unit tests for query routing. Offline / $0, pure function over an in-memory map.
// Locks: relevant-page selection, 1-hop neighbor expansion, bounded size, and
// deterministic ranking.

import { describe, it, expect } from "vitest";
import { routePages, tokenize } from "./routing";
import type { MemoryMap } from "../memory";

const node = (slug: string, title: string, tags: string[], links: string[]) => ({
  slug, title, type: "topic" as const, tags, sources: [], links,
});

// spaced-repetition <-> active-recall, spaced-repetition -> forgetting-curve,
// anki -> spaced-repetition, anki -> active-recall.
const MAP: MemoryMap = {
  version: 1,
  vault: "personal",
  pageCount: 4,
  nodes: [
    node("active-recall", "Active Recall", ["learning"], ["spaced-repetition"]),
    node("anki", "Anki", ["software"], ["active-recall", "spaced-repetition"]),
    node("forgetting-curve", "Forgetting Curve", ["memory"], ["spaced-repetition"]),
    node("spaced-repetition", "Spaced Repetition", ["learning", "memory"], ["active-recall", "forgetting-curve"]),
  ],
  edges: [
    { from: "active-recall", to: "spaced-repetition" },
    { from: "anki", to: "active-recall" },
    { from: "anki", to: "spaced-repetition" },
    { from: "forgetting-curve", to: "spaced-repetition" },
    { from: "spaced-repetition", to: "active-recall" },
    { from: "spaced-repetition", to: "forgetting-curve" },
  ],
  orphans: [],
  danglingLinks: [],
};

describe("tokenize", () => {
  it("lowercases, splits, and drops stopwords + 1-char tokens", () => {
    expect(tokenize("How does Spaced Repetition work?")).toEqual(["spaced", "repetition", "work"]);
  });
});

describe("routePages", () => {
  it("selects matching seeds, then 1-hop neighbors, ranked deterministically", () => {
    const routed = routePages(MAP, "How does spaced repetition fight the forgetting curve?");
    // Seeds (score 2 each, slug-tie-broken): forgetting-curve, spaced-repetition;
    // then neighbors of those seeds: active-recall, anki.
    expect(routed).toEqual(["forgetting-curve", "spaced-repetition", "active-recall", "anki"]);
  });

  it("is bounded by maxPages (seeds first)", () => {
    const routed = routePages(MAP, "spaced repetition forgetting curve", { maxPages: 2 });
    expect(routed).toEqual(["forgetting-curve", "spaced-repetition"]);
  });

  it("is deterministic across calls", () => {
    const q = "anki cards for active recall";
    expect(routePages(MAP, q)).toEqual(routePages(MAP, q));
  });

  it("pulls in neighbors of a single matched seed", () => {
    // Only 'anki' matches by title/slug; its edge neighbors come along, sorted.
    expect(routePages(MAP, "anki")).toEqual(["anki", "active-recall", "spaced-repetition"]);
  });

  it("returns [] when nothing is relevant", () => {
    expect(routePages(MAP, "What is the capital of France?")).toEqual([]);
  });
});
