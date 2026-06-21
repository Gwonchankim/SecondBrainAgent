// @mneme/wiki — vault layout + skeleton
// Each vault is its OWN git repo (hard isolation: invariant 11).

import * as path from "node:path";
import * as fs from "node:fs/promises";

export class Vault {
  constructor(public readonly id: string, public readonly root: string) {}

  get raw() { return path.join(this.root, "raw"); }
  get pages() { return path.join(this.root, "raw", "pages"); }
  get sessionNotes() { return path.join(this.root, "raw", "session-notes"); }
  get assets() { return path.join(this.root, "raw", "assets"); }
  get wiki() { return path.join(this.root, "wiki"); }
  get cache() { return path.join(this.root, ".cache"); } // gitignored, rebuildable
  get index() { return path.join(this.wiki, "index.md"); }
  get log() { return path.join(this.wiki, "log.md"); }
  get processed() { return path.join(this.wiki, "processed.md"); }
}

const GITIGNORE = `.cache/\n`;
const INDEX_SEED = `# Index\n\nTable of contents. Points to pages in raw/pages/.\n`;
const LOG_SEED = `# Log\n\nFormat: \`## [YYYY-MM-DD] ingest|query|dream|session - title\`\n`;
const PROCESSED_SEED = `# Processed\n\nRegistry of ingested raw sources. Never re-ingest what's listed here.\n`;

/** Create the on-disk skeleton (folders + wiki's three files). Caller git-inits. */
export async function scaffoldVault(v: Vault): Promise<void> {
  for (const d of [v.raw, v.pages, v.sessionNotes, v.assets, v.wiki, v.cache]) {
    await fs.mkdir(d, { recursive: true });
  }
  await fs.writeFile(path.join(v.root, ".gitignore"), GITIGNORE, "utf-8");
  await fs.writeFile(v.index, INDEX_SEED, "utf-8");
  await fs.writeFile(v.log, LOG_SEED, "utf-8");
  await fs.writeFile(v.processed, PROCESSED_SEED, "utf-8");
}
