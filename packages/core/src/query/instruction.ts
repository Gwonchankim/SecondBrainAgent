// @mneme/core — query instruction builder
//
// HOST-OWNED PROMPT for read-only synthesis. It hands the backend ONLY the question
// and the selected pages' content (injected inline), and constrains it to answer
// strictly from those pages, cite what it used by [[slug]], and decline ("Not in
// this vault.") when the pages do not cover the question. Pure function, no I/O.
// The adapter just runs this string with no file-editing permission.

/** The exact sentinel the backend must return when the pages do not answer. */
export const NOT_IN_VAULT = "Not in this vault.";

export interface QueryPage {
  slug: string;
  content: string;
}

/** Build the read-only query instruction from the question + selected pages. */
export function buildQueryInstruction(question: string, pages: QueryPage[]): string {
  const lines: string[] = [
    "You are answering a question using ONLY the knowledge pages provided below.",
    "These pages are the user's own vault. Do NOT use any outside knowledge, and do",
    "NOT fabricate. If the pages below do not contain the answer, reply with exactly:",
    NOT_IN_VAULT,
    "",
    "## Question",
    question,
    "",
    "## Pages you may use (the ONLY allowed sources)",
  ];

  for (const p of pages) {
    lines.push("", `### [[${p.slug}]]`, p.content);
  }

  lines.push(
    "",
    "## How to answer",
    "- Answer concisely in plain Markdown, grounded ONLY in the pages above.",
    "- Cite every page you actually used inline by its [[slug]], e.g. [[" +
      (pages[0]?.slug ?? "some-page") + "]].",
    "- Do not cite a page you did not use, and never invent a [[slug]] not listed above.",
    `- If the pages do not cover the question, reply with exactly: ${NOT_IN_VAULT}`,
    "- Do not create, edit, or propose any files. This is a read-only answer.",
  );

  return lines.join("\n");
}
