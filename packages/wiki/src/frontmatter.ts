// @mneme/wiki — frontmatter
// LOCKED minimal schema (scaffold decision #2).

import { z } from "zod";
import matter from "gray-matter";

export const PageFrontmatterSchema = z.object({
  type: z.enum(["topic", "entity", "synthesis", "source-summary"]),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  /** raw source-ids this page is grounded in (drives the graph + provenance). */
  sources: z.array(z.string()).default([]),
  created: z.string(), // YYYY-MM-DD
  updated: z.string(), // YYYY-MM-DD
  vault: z.string(),
});

export type PageFrontmatter = z.infer<typeof PageFrontmatterSchema>;

export interface ParsedPage {
  frontmatter: PageFrontmatter;
  body: string;
}

export function parsePage(raw: string): ParsedPage {
  const file = matter(raw);
  return { frontmatter: PageFrontmatterSchema.parse(file.data), body: file.content };
}

export function serializePage(page: ParsedPage): string {
  // Validate before writing — pages are truth; never persist an invalid one.
  const fm = PageFrontmatterSchema.parse(page.frontmatter);
  return matter.stringify(page.body, fm);
}

const WIKILINK = /\[\[([^\]]+)\]\]/g;

/** Extract wikilink targets (filename-based, Obsidian-compatible). */
export function extractWikilinks(body: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = WIKILINK.exec(body)) !== null) {
    out.add(m[1].split("|")[0].split("#")[0].trim());
  }
  return [...out];
}
