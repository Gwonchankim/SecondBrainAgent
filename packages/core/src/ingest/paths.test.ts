// Unit tests for the ingest path allowlist. SECURITY-CRITICAL: this guard is what
// stops an untrusted backend from writing outside raw/pages/ and bypassing the
// review gate (a `..` traversal could land in wiki/ and auto-commit). Offline/free.

import { describe, it, expect } from "vitest";
import type { ProposedFileChange } from "@mneme/provider";
import { checkIngestPaths, hasPathTraversal } from "./paths";

const change = (path: string, op: ProposedFileChange["op"] = "create"): ProposedFileChange => ({
  path,
  op,
  content: "",
});

describe("checkIngestPaths (ingest path allowlist)", () => {
  it("allows content pages under raw/pages/", () => {
    const r = checkIngestPaths([change("raw/pages/spaced-repetition.md"), change("raw/pages/sub/topic.md")]);
    expect(r.ok).toBe(true);
    expect(r.disallowed).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("blocks .. traversal that escapes raw/pages/", () => {
    for (const p of ["raw/pages/../wiki/log.md", "raw/pages/../../etc/passwd", "raw/pages/sub/../../wiki/index.md"]) {
      const r = checkIngestPaths([change(p)]);
      expect(r.ok).toBe(false);
      expect(r.disallowed).toContain(p);
    }
  });

  it("blocks win32 backslash traversal (normalized before checking)", () => {
    const r = checkIngestPaths([change("raw\\pages\\..\\wiki\\log.md")]);
    expect(r.ok).toBe(false);
    expect(r.disallowed).toContain("raw/pages/../wiki/log.md");
  });

  it("blocks writes outside raw/pages/ (wiki/, raw/ direct, .cache/, repo root)", () => {
    for (const p of ["wiki/index.md", "wiki/log.md", "raw/text/123.md", "raw/note.md", ".cache/x", "package.json"]) {
      const r = checkIngestPaths([change(p)]);
      expect(r.ok).toBe(false);
      expect(r.disallowed).toContain(p);
    }
  });

  it("flags every op (create/modify/delete) outside raw/pages/", () => {
    const r = checkIngestPaths([change("wiki/index.md", "modify"), change("wiki/log.md", "delete")]);
    expect(r.ok).toBe(false);
    expect(r.warnings.length).toBe(2);
  });

  it("a single disallowed change fails the whole set", () => {
    const r = checkIngestPaths([change("raw/pages/ok.md"), change("raw/pages/../wiki/x.md")]);
    expect(r.ok).toBe(false);
    expect(r.disallowed).toEqual(["raw/pages/../wiki/x.md"]);
  });
});

describe("hasPathTraversal", () => {
  it("detects '.' and '..' segments (slash + backslash)", () => {
    expect(hasPathTraversal("raw/pages/../wiki/x.md")).toBe(true);
    expect(hasPathTraversal("raw/pages/./x.md")).toBe(true);
    expect(hasPathTraversal("raw\\pages\\..\\x.md")).toBe(true);
  });

  it("passes clean paths", () => {
    expect(hasPathTraversal("raw/pages/x.md")).toBe(false);
    expect(hasPathTraversal("raw/pages/sub/y.md")).toBe(false);
  });
});
