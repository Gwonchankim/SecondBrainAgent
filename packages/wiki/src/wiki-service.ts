// @mneme/wiki — WikiService
//
// Owns the single source of truth and the proposal=branch concurrency model.
//   - raw sources: committed IMMEDIATELY on main (immutable input, no gate).
//   - page integration: lands as a PROPOSAL branch, gated, then merged.
// Approval re-validates against the live base (invariant 7): clean -> merge,
// moved-but-clean -> rebase+merge, conflict -> needsRegenerate.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { simpleGit, SimpleGit } from "simple-git";
import { Vault, scaffoldVault } from "./vault";
import type { ProposedFileChange } from "@mneme/provider";

export interface ProposalRecord {
  id: string;
  branch: string;
  baseCommit: string;
  message: string;
}

export interface ApproveResult {
  committed: boolean;
  rebased?: boolean;
  needsRegenerate?: boolean;
  commit?: string;
}

export class WikiService {
  private _git?: SimpleGit;
  constructor(public readonly vault: Vault) {}

  /** Lazy: the vault dir may not exist until initVault() runs. */
  private get git(): SimpleGit {
    if (!this._git) this._git = simpleGit(this.vault.root);
    return this._git;
  }

  async initVault(): Promise<void> {
    await scaffoldVault(this.vault); // creates the root dir first
    await this.git.init();
    // Ensure a stable default branch named "main".
    await this.git.addConfig("user.name", "Mneme Host", false, "local");
    await this.git.addConfig("user.email", "host@mneme.local", false, "local");
    await this.git.add(".");
    await this.git.commit("init: vault skeleton");
    await this.git.raw(["branch", "-M", "main"]);
  }

  async headCommit(): Promise<string> {
    return (await this.git.revparse(["HEAD"])).trim();
  }

  /** Immutable input: write under raw/ and commit immediately (no gate). */
  async saveRawSource(relPath: string, content: string): Promise<{ commit: string }> {
    const abs = path.join(this.vault.raw, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf-8");
    await this.git.add([abs]);
    await this.git.commit(`ingest(raw): ${relPath}`);
    return { commit: await this.headCommit() };
  }

  /** Create a proposal branch off the current main and write proposed changes there. */
  async createProposal(id: string, changes: ProposedFileChange[], message: string): Promise<ProposalRecord> {
    const baseCommit = await this.headCommit();
    const branch = `proposal/${id}`;
    await this.git.checkoutBranch(branch, baseCommit);
    await this.applyChanges(changes);
    await this.git.add(".");
    await this.git.commit(message);
    await this.git.checkout("main");
    return { id, branch, baseCommit, message };
  }

  /** Unified diff of a proposal vs its base, for the review UI. */
  async diffProposal(p: ProposalRecord): Promise<string> {
    return this.git.diff([`${p.baseCommit}..${p.branch}`]);
  }

  /** Content of each raw/pages/ file as it exists on the proposal branch. */
  async readProposalPages(p: ProposalRecord): Promise<{ path: string; content: string }[]> {
    const names = (await this.git.raw(["diff", "--name-only", `${p.baseCommit}..${p.branch}`])).trim();
    if (!names) return [];
    const out: { path: string; content: string }[] = [];
    for (const rel of names.split("\n").map((s) => s.trim()).filter(Boolean)) {
      const norm = rel.replace(/\\/g, "/");
      // Only real raw/pages/ files; reject '.'/'..' traversal segments.
      if (!/^raw\/pages\/.+\.md$/.test(norm) || norm.split("/").some((s) => s === "." || s === "..")) continue;
      try {
        out.push({ path: rel, content: await this.git.show([`${p.branch}:${rel}`]) });
      } catch {
        // File not present on the branch (e.g. a deletion) — nothing to read.
      }
    }
    return out;
  }

  /**
   * Approve under the concurrency model. If main has moved since baseCommit,
   * attempt a rebase; a conflict means the proposal is stale -> regenerate.
   */
  async approveProposal(p: ProposalRecord): Promise<ApproveResult> {
    const liveMain = await this.headCommit();
    await this.git.checkout("main");

    if (liveMain === p.baseCommit) {
      await this.git.merge(["--no-ff", p.branch]);
      await this.git.deleteLocalBranch(p.branch, true);
      return { committed: true, commit: await this.headCommit() };
    }

    // Base moved: rebase the proposal onto live main.
    try {
      await this.git.checkout(p.branch);
      await this.git.rebase(["main"]);
      await this.git.checkout("main");
      await this.git.merge(["--no-ff", p.branch]);
      await this.git.deleteLocalBranch(p.branch, true);
      return { committed: true, rebased: true, commit: await this.headCommit() };
    } catch {
      // Conflict -> abort, leave branch intact, signal regeneration.
      await this.git.raw(["rebase", "--abort"]).catch(() => undefined);
      await this.git.checkout("main").catch(() => undefined);
      return { committed: false, needsRegenerate: true };
    }
  }

  async rejectProposal(p: ProposalRecord): Promise<void> {
    await this.git.checkout("main").catch(() => undefined);
    await this.git.deleteLocalBranch(p.branch, true).catch(() => undefined);
  }

  private async applyChanges(changes: ProposedFileChange[]): Promise<void> {
    for (const c of changes) {
      const abs = path.join(this.vault.root, c.path);
      if (c.op === "delete") {
        await fs.rm(abs, { force: true });
        continue;
      }
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, c.content ?? "", "utf-8");
    }
  }
}
