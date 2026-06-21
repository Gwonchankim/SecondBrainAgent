// @mneme/core — worktree capture
//
// The constraint this solves: a provider like `claude -p` PHYSICALLY edits files
// in the working tree, but invariant 6 says a provider returns a PROPOSAL and
// never commits. So we run the mutating agent inside an ISOLATED detached git
// worktree checked out at HEAD, capture the resulting file changes as a proposal,
// and tear the worktree down. The vault's own working tree is never touched.

import { execFile } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { ProposedFileChange } from "@mneme/provider";

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

export interface CapturedRun<M> {
  changes: ProposedFileChange[];
  base: string;
  meta: M;
}

export async function captureChanges<M>(
  repoDir: string,
  mutate: (worktreeDir: string) => Promise<M>
): Promise<CapturedRun<M>> {
  const base = (await git(repoDir, ["rev-parse", "HEAD"])).trim();
  const wt = await fs.mkdtemp(path.join(os.tmpdir(), "mneme-wt-"));
  try {
    await git(repoDir, ["worktree", "add", "--detach", wt, base]);

    const meta = await mutate(wt); // real: spawn claude; test: a fake agent

    await git(wt, ["add", "-A"]); // gitignored paths (.cache) are skipped -> only truth captured
    const nameStatus = (await git(wt, ["diff", "--cached", "--name-status", base])).trim();

    const changes: ProposedFileChange[] = [];
    if (nameStatus) {
      for (const line of nameStatus.split("\n")) {
        const parts = line.split("\t");
        const status = parts[0];
        const rel = parts[parts.length - 1];
        if (status.startsWith("D")) {
          changes.push({ path: rel, op: "delete" });
        } else {
          const content = await fs.readFile(path.join(wt, rel), "utf-8");
          changes.push({ path: rel, op: status.startsWith("A") ? "create" : "modify", content });
        }
      }
    }
    return { changes, base, meta };
  } finally {
    // Always tear down — never leave a worktree behind, even on failure.
    await git(repoDir, ["worktree", "remove", "--force", wt]).catch(() => undefined);
    await fs.rm(wt, { recursive: true, force: true }).catch(() => undefined);
  }
}
