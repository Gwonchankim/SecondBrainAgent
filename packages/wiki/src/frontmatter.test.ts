// Unit tests for frontmatter date coercion. The schema's created/updated are a
// LOCKED string contract; YAML auto-parses unquoted dates into Date objects, which
// we coerce back to "YYYY-MM-DD" — but ONLY for pure date-only values, so an
// off-contract datetime+offset is rejected instead of being silently day-shifted.
// Offline/free.

import { describe, it, expect } from "vitest";
import { parsePage, PageFrontmatterSchema } from "./frontmatter";

const page = (created: string, updated: string = created): string =>
  [
    "---",
    "type: topic",
    "title: T",
    "tags: []",
    'sources: ["text/1.md"]',
    `created: ${created}`,
    `updated: ${updated}`,
    "vault: personal",
    "---",
    "",
    "body",
    "",
  ].join("\n");

describe("PageFrontmatter date coercion", () => {
  it("coerces an unquoted YAML date to a 'YYYY-MM-DD' string", () => {
    const { frontmatter } = parsePage(page("2026-06-21"));
    expect(typeof frontmatter.created).toBe("string");
    expect(frontmatter.created).toBe("2026-06-21");
    expect(frontmatter.updated).toBe("2026-06-21");
  });

  it("passes an already-quoted string through unchanged", () => {
    const { frontmatter } = parsePage(page('"2026-06-21"'));
    expect(frontmatter.created).toBe("2026-06-21");
  });

  it("does not day-shift boundary dates (year start / end / leap day)", () => {
    expect(parsePage(page("2026-01-01")).frontmatter.created).toBe("2026-01-01");
    expect(parsePage(page("2026-12-31")).frontmatter.created).toBe("2026-12-31");
    expect(parsePage(page("2000-02-29")).frontmatter.created).toBe("2000-02-29");
  });

  it("REJECTS a datetime+offset value (must not silently day-shift)", () => {
    // YAML parses this to a Date at 2026-06-20T20:00:00Z; coercion must NOT truncate
    // it to a shifted "YYYY-MM-DD" string. It is off-contract and must fail.
    expect(() => parsePage(page("2026-06-21 05:00:00 +09:00"))).toThrow();
    expect(() => parsePage(page("2026-06-21T05:00:00-09:00"))).toThrow();
  });

  it("REJECTS a non-string value (e.g. a YAML list)", () => {
    const bad = ["---", "type: topic", "title: T", "tags: []", "sources: []", "created: [1, 2]", "updated: 2026-06-21", "vault: v", "---", "", "b", ""].join("\n");
    expect(() => parsePage(bad)).toThrow();
  });

  it("keeps the string output contract (schema infers created as string)", () => {
    const parsed = PageFrontmatterSchema.parse({
      type: "topic", title: "T", tags: [], sources: [], created: "2026-06-21", updated: "2026-06-21", vault: "v",
    });
    expect(typeof parsed.created).toBe("string");
    expect(typeof parsed.updated).toBe("string");
  });
});
