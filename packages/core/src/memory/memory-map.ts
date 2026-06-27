// @mneme/core — MemoryMapService (real derivation)
//
// The Host's compact "what do I know / where is it / what links to what" index,
// derived ONLY from durable truth (raw/pages/*.md frontmatter + wikilinks). It is
// a rebuildable derivation (invariant 3): wiping .cache and rebuilding reproduces
// it byte-for-byte. It is NEVER a source of truth and is vault-internal only
// (invariants 1, 5/11) — it reads a single vault root and nothing else.
//
// Parsing reuses @mneme/wiki (parsePage + extractWikilinks); this module does NOT
// re-implement frontmatter parsing or the date-coercion boundary.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parsePage, extractWikilinks } from "@mneme/wiki";
import type { PageFrontmatter } from "@mneme/wiki";
import type { Derivation, DerivationContext } from "@mneme/cache";

/** Stable derivation name; also the cache subpath (.cache/memory-map.json). */
export const MEMORY_MAP = "memory-map";

/** One page in the vault, keyed by its filename slug (filename without .md). */
export interface MemoryMapNode {
  slug: string;
  title: string;
  type: PageFrontmatter["type"];
  tags: string[];
  sources: string[];
  /** Outgoing wikilink targets (slugs), sorted, regardless of resolvability. */
  links: string[];
}

/** A resolvable wikilink: both endpoints are existing pages. */
export interface MemoryMapEdge {
  from: string;
  to: string;
}

/** A wikilink whose target is not an existing page (recorded, never fatal). */
export interface DanglingLink {
  from: string;
  to: string;
}

export interface MemoryMap {
  /** Schema version, so consumers can detect shape changes. */
  version: 1;
  vault: string;
  pageCount: number;
  /** All pages, sorted by slug. */
  nodes: MemoryMapNode[];
  /** Resolvable links only, sorted by (from, to). */
  edges: MemoryMapEdge[];
  /** Pages with no incoming and no outgoing resolvable edge, sorted. */
  orphans: string[];
  /** Links pointing at a non-existent page, sorted by (from, to). */
  danglingLinks: DanglingLink[];
}

/** A raw page to fold into the map: its slug and full Markdown content. */
export interface PageInput {
  slug: string;
  content: string;
}

const bySlug = (a: { slug: string }, b: { slug: string }) => a.slug.localeCompare(b.slug);
const byEdge = (a: MemoryMapEdge, b: MemoryMapEdge) =>
  a.from.localeCompare(b.from) || a.to.localeCompare(b.to);

/**
 * Build the map from in-memory pages. Pure and deterministic: output depends only
 * on the inputs, with stable key/array ordering and NO timestamps, so repeated
 * builds are byte-identical. Pages whose frontmatter fails the schema are skipped
 * (truth pages are validated before commit; a bad page must not crash a rebuild).
 */
export function buildMemoryMap(vault: string, pages: PageInput[]): MemoryMap {
  const nodes: MemoryMapNode[] = [];

  for (const { slug, content } of pages) {
    let parsed;
    try {
      parsed = parsePage(content);
    } catch {
      // Skip an unparseable page rather than failing the whole derivation.
      continue;
    }
    const fm = parsed.frontmatter;
    const links = [...new Set(extractWikilinks(parsed.body))].sort((a, b) => a.localeCompare(b));
    nodes.push({
      slug,
      title: fm.title,
      type: fm.type,
      tags: [...fm.tags],
      sources: [...fm.sources],
      links,
    });
  }

  nodes.sort(bySlug);

  const slugs = new Set(nodes.map((n) => n.slug));
  const edges: MemoryMapEdge[] = [];
  const danglingLinks: DanglingLink[] = [];
  const linked = new Set<string>(); // slugs that take part in any resolvable edge

  for (const node of nodes) {
    for (const to of node.links) {
      if (slugs.has(to)) {
        edges.push({ from: node.slug, to });
        linked.add(node.slug);
        linked.add(to);
      } else {
        danglingLinks.push({ from: node.slug, to });
      }
    }
  }

  edges.sort(byEdge);
  danglingLinks.sort(byEdge);
  const orphans = nodes
    .map((n) => n.slug)
    .filter((s) => !linked.has(s))
    .sort((a, b) => a.localeCompare(b));

  return { version: 1, vault, pageCount: nodes.length, nodes, edges, orphans, danglingLinks };
}

/** True when a directory entry is a content page (a .md file under raw/pages/). */
const isPage = (name: string) => name.toLowerCase().endsWith(".md");

/**
 * Read every content page under <vaultRoot>/raw/pages (recursively). The slug is
 * the filename without its .md extension — wikilinks are filename-based, so nested
 * directories do not change a page's identity. Scoped to one vault root only.
 */
export async function readPagesDir(vaultRoot: string): Promise<PageInput[]> {
  const pagesDir = path.join(vaultRoot, "raw", "pages");
  const out: PageInput[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // no pages dir yet -> empty map
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && isPage(e.name)) {
        const content = await fs.readFile(full, "utf-8");
        out.push({ slug: path.basename(e.name, path.extname(e.name)), content });
      }
    }
  }

  await walk(pagesDir);
  return out;
}

/** Derive the map straight from a vault's durable truth on disk. */
export async function deriveMemoryMap(vaultId: string, vaultRoot: string): Promise<MemoryMap> {
  return buildMemoryMap(vaultId, await readPagesDir(vaultRoot));
}

/** Serialize deterministically (stable key order + trailing newline). */
export function serializeMemoryMap(map: MemoryMap): string {
  return JSON.stringify(map, null, 2) + "\n";
}

/** Read the persisted derivation from a vault's .cache, or null if not built. */
export async function loadMemoryMap(cacheDir: string): Promise<MemoryMap | null> {
  try {
    const raw = await fs.readFile(path.join(cacheDir, `${MEMORY_MAP}.json`), "utf-8");
    return JSON.parse(raw) as MemoryMap;
  } catch {
    return null;
  }
}

/**
 * Render the compact "existing pages, link to these" context block the Host can
 * later inject into an ingest/query prompt. NOT wired into any prompt yet — this is
 * only the accessor. Kept small for context-budget reasons.
 */
export function toContextSummary(map: MemoryMap): string {
  if (map.nodes.length === 0) {
    return `No existing pages in vault "${map.vault}" yet.`;
  }
  const lines = map.nodes.map((n) => {
    const tags = n.tags.length ? ` tags: ${n.tags.join(", ")}` : "";
    return `- ${n.slug} - "${n.title}" (${n.type})${tags}`;
  });
  return [
    `Existing pages in vault "${map.vault}" (${map.pageCount}).`,
    "Link to these with [[slug]]; do not duplicate them:",
    ...lines,
  ].join("\n");
}

/**
 * The memory-map derivation, registered with the CacheManager so approve -> rebuild
 * regenerates it alongside graph-index / search-index.
 */
export class MemoryMapDerivation implements Derivation {
  readonly name = MEMORY_MAP;

  async rebuild(ctx: DerivationContext): Promise<void> {
    const map = await deriveMemoryMap(ctx.vaultId, ctx.vaultRoot);
    await fs.writeFile(path.join(ctx.cacheDir, `${this.name}.json`), serializeMemoryMap(map), "utf-8");
  }
}

export const memoryMapDerivation = new MemoryMapDerivation();
