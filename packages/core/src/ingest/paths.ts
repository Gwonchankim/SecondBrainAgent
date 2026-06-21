// @mneme/core — ingest path allowlist
//
// Structural enforcement of the ingest contract: an ingest run may only create a
// page under raw/pages/. Any captured change touching a raw/ direct file, wiki/,
// .cache/, or anywhere else is flagged so the Host can force the proposal to draft
// instead of trusting the prompt. This is a PATH guard, not a prompt guard.

import type { ProposedFileChange } from "@mneme/provider";

/** The ONLY location an ingest run may write (content pages). */
const ALLOWED_PAGE = /^raw\/pages\/.+/;

/** A '.'/'..' segment lets path.join() collapse the path OUT of raw/pages/ (e.g.
 *  raw/pages/../wiki/x.md -> wiki/x.md), defeating the prefix check. Reject any
 *  such traversal. Slash-normalize first so win32 backslash paths are covered. */
export function hasPathTraversal(rawPath: string): boolean {
  return rawPath
    .replace(/\\/g, "/")
    .split("/")
    .some((seg) => seg === "." || seg === "..");
}

export interface PathGuardResult {
  /** True when every captured change is under raw/pages/. */
  ok: boolean;
  /** One human-readable warning per change outside raw/pages/. */
  warnings: string[];
  /** Normalized paths that fell outside the allowlist. */
  disallowed: string[];
}

/** Flag any captured change whose path is not under raw/pages/ (any op). */
export function checkIngestPaths(changes: ProposedFileChange[]): PathGuardResult {
  const disallowed: string[] = [];
  const warnings: string[] = [];
  for (const c of changes) {
    const rel = c.path.replace(/\\/g, "/");
    if (!ALLOWED_PAGE.test(rel) || hasPathTraversal(rel)) {
      disallowed.push(rel);
      warnings.push(`Ingest touched a path outside raw/pages/: ${c.op} ${rel}`);
    }
  }
  return { ok: disallowed.length === 0, warnings, disallowed };
}
