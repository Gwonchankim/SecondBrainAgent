// Unit tests for the memory-map derivation. Offline / $0: pure builds plus a couple
// of temp-dir rebuilds (no model, no network). Locks the four guarantees the Host
// relies on: deterministic byte-identical rebuild, correct nodes/edges/orphans/
// dangling links, vault isolation, and edge-frontmatter handling via @mneme/wiki.

import { describe, it, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { CacheManager } from "@mneme/cache";
import {
  buildMemoryMap,
  deriveMemoryMap,
  serializeMemoryMap,
  toContextSummary,
  memoryMapDerivation,
  MEMORY_MAP,
  PageInput,
} from "./memory-map";

// Build a page body with the LOCKED frontmatter keys. `created` is injected verbatim
// so a test can exercise the unquoted-date path through the @mneme/wiki parser.
function page(opts: {
  type?: string;
  title: string;
  tags?: string[];
  sources?: string[];
  created?: string;
  body?: string;
}): string {
  const { type = "topic", title, tags = [], sources = [], created = "2026-06-21", body = "" } = opts;
  return [
    "---",
    `type: ${type}`,
    `title: "${title}"`,
    `tags: [${tags.join(", ")}]`,
    `sources: [${sources.join(", ")}]`,
    `created: ${created}`,
    `updated: ${created}`,
    "vault: personal",
    "---",
    "",
    body,
    "",
  ].join("\n");
}

const FIXTURE: PageInput[] = [
  {
    slug: "spaced-repetition",
    content: page({
      title: "Spaced Repetition",
      tags: ["learning", "memory"],
      sources: ["text/1.md"],
      body: "Builds on [[memory]] and cites [[nonexistent-page]].",
    }),
  },
  { slug: "memory", content: page({ title: "Memory", body: "See [[spaced-repetition]]." }) },
  { slug: "loner", content: page({ type: "entity", title: "Loner", body: "No links here." }) },
];

describe("buildMemoryMap", () => {
  it("derives nodes/edges/orphans/dangling links from pages + wikilinks", () => {
    const map = buildMemoryMap("personal", FIXTURE);

    expect(map.version).toBe(1);
    expect(map.vault).toBe("personal");
    expect(map.pageCount).toBe(3);

    // Nodes sorted by slug.
    expect(map.nodes.map((n) => n.slug)).toEqual(["loner", "memory", "spaced-repetition"]);

    const sr = map.nodes.find((n) => n.slug === "spaced-repetition")!;
    expect(sr.title).toBe("Spaced Repetition");
    expect(sr.type).toBe("topic");
    expect(sr.tags).toEqual(["learning", "memory"]);
    expect(sr.sources).toEqual(["text/1.md"]);
    // Outgoing links sorted, includes the dangling target.
    expect(sr.links).toEqual(["memory", "nonexistent-page"]);

    // Only resolvable links become edges, sorted by (from, to).
    expect(map.edges).toEqual([
      { from: "memory", to: "spaced-repetition" },
      { from: "spaced-repetition", to: "memory" },
    ]);

    // The link to a non-existent page is recorded, not fatal.
    expect(map.danglingLinks).toEqual([{ from: "spaced-repetition", to: "nonexistent-page" }]);

    // loner participates in no resolvable edge.
    expect(map.orphans).toEqual(["loner"]);
  });

  it("is deterministic: same pages -> byte-identical serialization (any input order)", () => {
    const a = serializeMemoryMap(buildMemoryMap("personal", FIXTURE));
    const reversed = [...FIXTURE].reverse();
    const b = serializeMemoryMap(buildMemoryMap("personal", reversed));
    expect(b).toBe(a);
    // No wall-clock leaks into the artifact.
    expect(a).not.toMatch(/builtAt|\d{4}-\d{2}-\d{2}T/);
  });

  it("handles edge frontmatter (unquoted date + empty tags) via the @mneme/wiki parser", () => {
    const map = buildMemoryMap("personal", [
      { slug: "edge", content: page({ title: "Edge", created: "2026-06-21", tags: [] }) },
    ]);
    expect(map.nodes).toHaveLength(1);
    expect(map.nodes[0].tags).toEqual([]);
  });

  it("skips an unparseable page instead of crashing the derivation", () => {
    const map = buildMemoryMap("personal", [
      { slug: "good", content: page({ title: "Good" }) },
      { slug: "bad", content: "---\ntype: not-a-real-type\ntitle: Bad\n---\nbody" },
    ]);
    expect(map.nodes.map((n) => n.slug)).toEqual(["good"]);
  });
});

describe("toContextSummary", () => {
  it("renders a compact 'existing pages, link to these' block", () => {
    const summary = toContextSummary(buildMemoryMap("personal", FIXTURE));
    expect(summary).toContain('Existing pages in vault "personal" (3)');
    expect(summary).toContain('- spaced-repetition - "Spaced Repetition" (topic) tags: learning, memory');
    expect(summary).toContain('- loner - "Loner" (entity)');
  });

  it("reports an empty vault", () => {
    expect(toContextSummary(buildMemoryMap("personal", []))).toBe('No existing pages in vault "personal" yet.');
  });
});

// --- disk-backed: derivation + rebuild contract --------------------------------

async function writePages(vaultRoot: string, pages: PageInput[]): Promise<void> {
  const dir = path.join(vaultRoot, "raw", "pages");
  await fs.mkdir(dir, { recursive: true });
  for (const p of pages) await fs.writeFile(path.join(dir, `${p.slug}.md`), p.content, "utf-8");
}

describe("MemoryMapDerivation (disk)", () => {
  it("wipe .cache + rebuild reproduces a byte-identical memory-map.json", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mneme-mm-"));
    try {
      await writePages(root, FIXTURE);
      const cacheDir = path.join(root, ".cache");
      const cache = new CacheManager().register(memoryMapDerivation);
      const ctx = { vaultId: "personal", vaultRoot: root, cacheDir };
      const file = path.join(cacheDir, `${MEMORY_MAP}.json`);

      await cache.rebuildAll(ctx);
      const first = await fs.readFile(file, "utf-8");

      // rebuildAll already wipes .cache; rebuild again and compare bytes.
      await cache.rebuildAll(ctx);
      const second = await fs.readFile(file, "utf-8");
      expect(second).toBe(first);

      // The on-disk artifact matches a fresh in-memory derivation exactly.
      expect(first).toBe(serializeMemoryMap(await deriveMemoryMap("personal", root)));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("is vault-internal: a sibling vault's pages are never read", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "mneme-iso-"));
    try {
      const vaultA = path.join(base, "a");
      const vaultB = path.join(base, "b");
      await writePages(vaultA, [{ slug: "a-page", content: page({ title: "A" }) }]);
      await writePages(vaultB, [{ slug: "b-page", content: page({ title: "B" }) }]);

      const map = await deriveMemoryMap("a", vaultA);
      expect(map.nodes.map((n) => n.slug)).toEqual(["a-page"]);
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });

  it("yields an empty map for a vault with no pages dir", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mneme-empty-"));
    try {
      const map = await deriveMemoryMap("personal", root);
      expect(map).toMatchObject({ pageCount: 0, nodes: [], edges: [], orphans: [], danglingLinks: [] });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
