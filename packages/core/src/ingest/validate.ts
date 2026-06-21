// @mneme/core — ingest page validation
//
// After a backend run is captured, the Host checks any produced page against the
// LOCKED frontmatter schema BEFORE a proposal is created. Invalid pages must never
// auto-commit (truth model): the Host turns the proposal into a draft instead.
// Pure function over the captured changes; reuses parsePage from @mneme/wiki so
// validation matches exactly what WikiService would later persist.

import { parsePage } from "@mneme/wiki";
import type { ProposedFileChange } from "@mneme/provider";
import { hasPathTraversal } from "./paths";

/** Content pages live under raw/pages/*.md (slashes normalized for win32). */
const PAGE_RE = /^raw\/pages\/.+\.md$/;

export interface IngestValidation {
  /** True when every produced page parsed + passed PageFrontmatterSchema. */
  ok: boolean;
  /** Page paths that validated cleanly. */
  validPages: string[];
  /** One human-readable warning per page that failed validation. */
  warnings: string[];
}

/**
 * Validate every create/modify change that targets a content page. Deletes and
 * non-page paths are ignored (they are not frontmatter-bearing truth pages).
 */
export function validateProposedPages(changes: ProposedFileChange[]): IngestValidation {
  const validPages: string[] = [];
  const warnings: string[] = [];

  for (const c of changes) {
    if (c.op === "delete") continue;
    const rel = c.path.replace(/\\/g, "/");
    // Skip traversal paths: the path guard rejects them; never treat one as a page.
    if (!PAGE_RE.test(rel) || hasPathTraversal(rel)) continue;

    try {
      parsePage(c.content ?? "");
      validPages.push(rel);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Page ${rel} failed frontmatter validation: ${msg}`);
    }
  }

  return { ok: warnings.length === 0, validPages, warnings };
}
