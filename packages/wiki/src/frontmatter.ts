// @mneme/wiki — frontmatter
// LOCKED minimal schema (scaffold decision #2).

import { z } from "zod";
import matter from "gray-matter";

// YAML auto-parses an unquoted `2026-06-21` into a JS Date. Coerce ONLY a pure
// date-only value (parsed as UTC midnight) back to its "YYYY-MM-DD" string before
// validation, so quoted strings and unquoted date-only YAML both satisfy the
// (unchanged) string contract. A Date carrying a time/offset is NOT a YYYY-MM-DD
// value -> leave it for z.string() to REJECT, rather than silently truncating it to
// a UTC day that can differ by one from the author's wall-clock day.
const DateString = z.preprocess((v) => {
  if (v instanceof Date) {
    const dateOnly =
      v.getUTCHours() === 0 &&
      v.getUTCMinutes() === 0 &&
      v.getUTCSeconds() === 0 &&
      v.getUTCMilliseconds() === 0;
    return dateOnly ? v.toISOString().slice(0, 10) : v;
  }
  return v;
}, z.string());

export const PageFrontmatterSchema = z.object({
  type: z.enum(["topic", "entity", "synthesis", "source-summary"]),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  /** raw source-ids this page is grounded in (drives the graph + provenance). */
  sources: z.array(z.string()).default([]),
  created: DateString, // YYYY-MM-DD (Date coerced to string)
  updated: DateString, // YYYY-MM-DD (Date coerced to string)
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
