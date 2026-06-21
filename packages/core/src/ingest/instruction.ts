// @mneme/core — ingest instruction builder
//
// HOST-OWNED PROMPT. The Host phrases the task that drives a thin backend
// (`claude -p`) to integrate a raw source into ONE knowledge page. Keeping this
// here (not in any adapter) is what keeps adapters thin: the adapter only runs
// the prompt, it never decides what page to write. Pure function, no I/O.
//
// The frontmatter contract spelled out below mirrors PageFrontmatterSchema in
// @mneme/wiki (packages/wiki/src/frontmatter.ts). The Host validates the captured
// page against that schema after the run (see ./validate); this prompt just gives
// the backend the best chance of producing a conforming page on the first pass.

export interface IngestInstructionInput {
  /** Path of the immutable raw source, relative to the vault's raw/ dir. */
  rawRelPath: string;
  /** The raw source text, injected inline so the backend need not guess. */
  rawContent: string;
  /** The vault id; goes verbatim into frontmatter `vault`. */
  vaultId: string;
  /** Stable provenance id for the raw source; goes into frontmatter `sources`. */
  sourceId: string;
}

/**
 * Build the natural-language instruction for a single ingest run.
 * The backend executes inside an isolated worktree rooted at the vault, so all
 * paths below are vault-relative.
 */
export function buildIngestInstruction(input: IngestInstructionInput): string {
  const { rawRelPath, rawContent, vaultId, sourceId } = input;
  return [
    "You are integrating a new raw source into a personal knowledge vault (a Git repo).",
    "Goal: turn the raw source into ONE well-structured Markdown knowledge page.",
    "",
    "## Read the source",
    `The immutable raw source lives at: raw/${rawRelPath}`,
    "Its full content is also provided inline below (between the markers) so you do",
    "not need to guess; you may also open the file to confirm.",
    "<<<RAW_SOURCE",
    rawContent,
    "RAW_SOURCE",
    "",
    "## Write exactly one page",
    "Create ONE new file at: raw/pages/<slug>.md",
    "where <slug> is a short kebab-case slug derived from the page title",
    "(lowercase ASCII words separated by single hyphens). Do not create any other",
    "file, and do not split the source across multiple pages.",
    "",
    "## Frontmatter (STRICT - validated against a schema after the run)",
    "Begin the file with a YAML frontmatter block delimited by `---` lines, using",
    "EXACTLY these keys (do not add, rename, or omit any key):",
    "  type:    one of: topic | entity | synthesis | source-summary",
    "  title:   a concise, non-empty human title (quote it if it contains a colon)",
    "  tags:    a YAML list of lowercase string tags (may be empty: [])",
    `  sources: a YAML list of raw source-ids; it MUST include "${sourceId}"`,
    "  created: today's date (the date this task runs), in YYYY-MM-DD format",
    "  updated: today's date (the date this task runs), in YYYY-MM-DD format",
    `  vault:   the exact string "${vaultId}"`,
    "",
    "## Body",
    "After the frontmatter, write the integrated knowledge as clear Markdown.",
    "Summarize and structure the source in your own words; do not copy it verbatim.",
    "Link related concepts with filename-based [[wikilinks]] (Obsidian style), e.g.",
    "[[some-other-page]] referencing another page's filename without the .md.",
    "Wikilinks resolve vault-internally only: never link outside this vault, and",
    "never use a URL as a wikilink target.",
    "",
    "## Hard constraints (do NOT violate)",
    "- Create ONLY the single new file under raw/pages/. Touch nothing else.",
    "- Never edit a file that sits directly in raw/ (those are immutable raw sources).",
    "- Never edit anything under wiki/ or .cache/.",
    "- Never delete or rename existing files.",
    "- Do not commit; the host reviews and commits your proposed page.",
  ].join("\n");
}
