// scripts/dev-capture.ts
// Proves the worktree-capture mechanism that lets a file-mutating backend still
// yield a pure proposal. A fake agent stands in for `claude -p`: it creates,
// modifies, and deletes files in the isolated worktree. We then verify:
//   1) captured changes match (A/M/D),
//   2) the vault's OWN working tree stays clean (untouched),
//   3) no leftover worktrees.
// Run: npx ts-node scripts/dev-capture.ts

import { execFile } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { promisify } from "node:util";
import { WikiService, Vault } from "@mneme/wiki";
import { captureChanges } from "@mneme/core";

const exec = promisify(execFile);
const git = (cwd: string, args: string[]) => exec("git", args, { cwd });

async function main(): Promise<void> {
  const root = path.join(os.tmpdir(), "mneme-capture", "personal");
  await fs.rm(path.join(os.tmpdir(), "mneme-capture"), { recursive: true, force: true });

  const wiki = new WikiService(new Vault("personal", root));
  await wiki.initVault();
  // Seed a committed page so we can test a deletion.
  await wiki.saveRawSource("pages/old.md", "# old\nto be deleted\n");
  console.log("seeded vault at", root);

  // Fake agent = what `claude -p` would do to the working tree.
  const fakeAgent = async (wt: string) => {
    await fs.mkdir(path.join(wt, "raw", "pages"), { recursive: true });
    await fs.writeFile(path.join(wt, "raw", "pages", "new-note.md"), "# new\nfrom agent\n", "utf-8");
    await fs.appendFile(path.join(wt, "wiki", "index.md"), "\n- [[new-note]]\n", "utf-8");
    await fs.rm(path.join(wt, "raw", "pages", "old.md"), { force: true });
    return { result: "fake agent edited 3 files", total_cost_usd: 0, is_error: false };
  };

  const captured = await captureChanges(root, fakeAgent);
  console.log("\ncaptured proposal changes:");
  for (const c of captured.changes) console.log(`  ${c.op.padEnd(6)} ${c.path}`);
  console.log("meta:", JSON.stringify(captured.meta));

  // Invariant checks.
  const status = (await git(root, ["status", "--porcelain"])).stdout.trim();
  const worktrees = (await git(root, ["worktree", "list"])).stdout.trim().split("\n");
  console.log("\nvault working tree clean:", status === "" ? "YES (untouched)" : `NO -> ${status}`);
  console.log("worktrees remaining:", worktrees.length, "(expect 1 = main only)");
}

main().catch((e) => { console.error(e); process.exit(1); });
