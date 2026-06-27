// Unit tests for memory-map context injection into the ingest instruction. Offline
// / $0 (no model): asserts the Host injects an "existing pages" block only when the
// vault has pages, renders real slugs the backend must link to, and stays a no-op
// for a fresh/empty vault.

import { describe, it, expect } from "vitest";
import { buildIngestInstruction } from "./instruction";
import { buildMemoryMap } from "../memory";

const base = {
  rawRelPath: "text/123.md",
  rawContent: "The forgetting curve and spaced repetition.",
  vaultId: "personal",
  sourceId: "text/123.md",
};

const page = (slug: string, title: string) => ({
  slug,
  content: [
    "---",
    "type: topic",
    `title: "${title}"`,
    "tags: []",
    "sources: []",
    "created: 2026-06-21",
    "updated: 2026-06-21",
    "vault: personal",
    "---",
    "body",
  ].join("\n"),
});

describe("buildIngestInstruction — memory-map injection", () => {
  it("injects an existing-pages block listing real slugs when the vault has pages", () => {
    const map = buildMemoryMap("personal", [
      page("spaced-repetition", "Spaced Repetition"),
      page("active-recall", "Active Recall"),
    ]);
    const out = buildIngestInstruction({ ...base, memoryMap: map });

    expect(out).toContain("Existing pages in this vault");
    expect(out).toContain("do NOT duplicate");
    // The exact slugs the backend should link to are present.
    expect(out).toContain("- spaced-repetition -");
    expect(out).toContain("- active-recall -");
    // The one-page contract is still stated.
    expect(out).toContain("Write exactly one page");
  });

  it("injects nothing for an empty map (fresh vault) — no block, no noise", () => {
    const out = buildIngestInstruction({ ...base, memoryMap: buildMemoryMap("personal", []) });
    expect(out).not.toContain("Existing pages in this vault");
  });

  it("injects nothing when no map is supplied at all (backward-compatible)", () => {
    const out = buildIngestInstruction(base);
    expect(out).not.toContain("Existing pages in this vault");
    // Core instruction is unchanged.
    expect(out).toContain("Write exactly one page");
  });
});
