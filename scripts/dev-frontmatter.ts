// scripts/dev-frontmatter.ts
// Proof for the parse-boundary date coercion. YAML parses an UNQUOTED `2026-06-21`
// into a JS Date; PageFrontmatterSchema coerces Date -> "YYYY-MM-DD" before zod's
// string check, so the page validates and `created`/`updated` come back as strings.
// Run: npm run dev:frontmatter

import { parsePage } from "@mneme/wiki";

const UNQUOTED_DATE_PAGE = [
  "---",
  "type: topic",
  "title: Unquoted Date Proof",
  "tags: []",
  'sources: ["text/123.md"]',
  "created: 2026-06-21", // unquoted on purpose -> YAML Date
  "updated: 2026-06-21", // unquoted on purpose -> YAML Date
  "vault: personal",
  "---",
  "",
  "Body referencing [[another-page]].",
  "",
].join("\n");

function main(): void {
  const { frontmatter } = parsePage(UNQUOTED_DATE_PAGE);
  console.log("created:", JSON.stringify(frontmatter.created), `(type: ${typeof frontmatter.created})`);
  console.log("updated:", JSON.stringify(frontmatter.updated), `(type: ${typeof frontmatter.updated})`);

  const ok =
    typeof frontmatter.created === "string" &&
    typeof frontmatter.updated === "string" &&
    frontmatter.created === "2026-06-21" &&
    frontmatter.updated === "2026-06-21";

  if (ok) {
    console.log('RESULT: PASS - unquoted YAML date coerced to the string "2026-06-21" and validated');
  } else {
    console.error('RESULT: FAIL - expected created/updated to be the string "2026-06-21"');
    process.exit(1);
  }
}

main();
