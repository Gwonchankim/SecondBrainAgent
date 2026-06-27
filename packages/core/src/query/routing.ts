// @mneme/core — query routing
//
// Phase-1 routing: pick a small, bounded, DETERMINISTIC set of pages relevant to a
// question, using only the memory-map (titles + tags + slug tokens) plus 1-hop edge
// neighbors. No search engine, no embeddings (that is Phase 4). Pure function over
// the derived map — no I/O — so it is cheap and fully testable.

import type { MemoryMap, MemoryMapNode } from "../memory";

/** Default cap on injected pages (context budget). */
export const DEFAULT_MAX_PAGES = 6;

// Tiny stopword set so common words (the, how, is...) do not create spurious
// title/tag matches. Kept minimal and explicit on purpose.
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "do", "does", "for",
  "from", "how", "i", "in", "is", "it", "its", "of", "on", "or", "that", "the",
  "to", "was", "what", "when", "where", "which", "who", "why", "with", "you",
]);

/** Lowercase, split on non-alphanumerics, drop stopwords + 1-char tokens, dedupe. */
export function tokenize(text: string): string[] {
  const out = new Set<string>();
  for (const t of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length > 1 && !STOPWORDS.has(t)) out.add(t);
  }
  return [...out];
}

/** The searchable token set of a node: its title, tags, and slug words. */
function nodeTokens(node: MemoryMapNode): Set<string> {
  return new Set([
    ...tokenize(node.title),
    ...node.tags.flatMap(tokenize),
    ...tokenize(node.slug),
  ]);
}

/** Distinct query tokens that appear in the node's token set. */
function score(node: MemoryMapNode, queryTokens: string[]): number {
  const toks = nodeTokens(node);
  let s = 0;
  for (const q of queryTokens) if (toks.has(q)) s += 1;
  return s;
}

/** 1-hop edge neighbors of a slug (both directions). */
function neighbors(map: MemoryMap, slug: string): string[] {
  const out = new Set<string>();
  for (const e of map.edges) {
    if (e.from === slug) out.add(e.to);
    if (e.to === slug) out.add(e.from);
  }
  return [...out];
}

export interface RouteOptions {
  maxPages?: number;
}

/**
 * Select up to `maxPages` page slugs relevant to `question`:
 *   1. seeds = nodes whose title/tags/slug overlap the question, ranked by overlap
 *      count (desc), ties broken by slug (asc) — fully deterministic;
 *   2. expand with 1-hop edge neighbors of the seeds (sorted, deduped), so a
 *      directly-relevant page pulls in its closely-linked context;
 *   3. cap the total at `maxPages`, seeds first.
 * Returns [] when nothing overlaps (caller treats this as "not in this vault").
 */
export function routePages(map: MemoryMap, question: string, opts: RouteOptions = {}): string[] {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const queryTokens = tokenize(question);

  const seeds = map.nodes
    .map((n) => ({ slug: n.slug, s: score(n, queryTokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.slug.localeCompare(b.slug))
    .map((x) => x.slug);

  const selected: string[] = [];
  const add = (slug: string) => {
    if (selected.length < maxPages && !selected.includes(slug)) selected.push(slug);
  };

  for (const slug of seeds) add(slug);
  // Neighbors of seeds, in seed order, each seed's neighbors sorted for determinism.
  for (const slug of seeds) {
    for (const n of neighbors(map, slug).sort((a, b) => a.localeCompare(b))) add(n);
  }

  return selected;
}
