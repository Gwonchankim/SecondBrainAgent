// Read-only query pipeline tests. Offline / $0 — the backend is a spy that records
// calls and never runs a model. Locks the hard guarantees:
//   - a query calls runQuery, NEVER runTask (so the worktree-capture path that
//     produces proposedChanges is never reached);
//   - sendMessage emits AgentStarted + AgentEvent(answer) and NO proposal events
//     (DiffReady / ApprovalRequired / WikiCommitted);
//   - cited slugs are always a subset of the routed pages;
//   - "not in this vault" short-circuits with no backend call.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type {
  AgentProvider, AgentRunResult, AgentTask, AuthStatus, ProviderCapabilities, QueryResult, QueryTask,
} from "@mneme/provider";
import type { CoreEvent } from "@mneme/ipc";
import { CacheManager } from "@mneme/cache";
import { MnemeCore } from "../core";
import { DEFAULT_PERSONAL_POLICY } from "../policies";
import { NOT_IN_VAULT } from "./instruction";

class SpyProvider implements AgentProvider {
  readonly id = "spy";
  runQueryCalls = 0;
  runTaskCalls = 0;
  lastInstruction = "";
  answer = "";

  getCapabilities(): ProviderCapabilities {
    return { unattendedExecution: true, subagents: false, diffCapture: true, authModes: ["delegated"], workspaceScoping: true, streaming: false };
  }
  async authenticate(): Promise<AuthStatus> {
    return { authenticated: true, mode: "delegated" };
  }
  // A query must NEVER reach runTask (that is the only path to captureChanges).
  async runTask(_input: AgentTask): Promise<AgentRunResult> {
    this.runTaskCalls += 1;
    throw new Error("runTask must not be called during a read-only query");
  }
  async runQuery(input: QueryTask): Promise<QueryResult> {
    this.runQueryCalls += 1;
    this.lastInstruction = input.instruction;
    return { runId: input.runId, status: "ok", answer: this.answer, usage: { costUsd: 0 } };
  }
  async cancelRun(): Promise<void> {}
}

const noopCreds = { backend: "noop", async set() {}, async get() { return null; }, async delete() { return false; } };

function pageFile(slug: string, title: string, body: string): { name: string; content: string } {
  return {
    name: `${slug}.md`,
    content: [
      "---", "type: topic", `title: "${title}"`, "tags: [learning]", "sources: []",
      "created: 2026-06-21", "updated: 2026-06-21", "vault: personal", "---", "", body,
    ].join("\n"),
  };
}

let root: string;
let spy: SpyProvider;
let core: MnemeCore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "mneme-q-"));
  const dir = path.join(root, "raw", "pages");
  await fs.mkdir(dir, { recursive: true });
  for (const p of [
    pageFile("spaced-repetition", "Spaced Repetition", "Reviews at widening intervals. See [[active-recall]]."),
    pageFile("active-recall", "Active Recall", "Retrieve from memory."),
  ]) {
    await fs.writeFile(path.join(dir, p.name), p.content, "utf-8");
  }
  spy = new SpyProvider();
  core = new MnemeCore({
    credentials: noopCreds,
    cache: new CacheManager(),
    providers: new Map([["spy", spy]]),
    defaultProviderId: "spy",
  });
  await core.registerVault("personal", root, DEFAULT_PERSONAL_POLICY);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("read-only query pipeline", () => {
  it("answers via runQuery, never runTask, and returns citations that are a subset of routed pages", async () => {
    // Cite one routed page and one page that was NOT routed/injected.
    spy.answer = "Spaced repetition pairs with [[active-recall]]. Unrelated [[not-routed-fake]].";
    const out = await core.answerQuestion("personal", "How does spaced repetition relate to active recall?");

    expect(spy.runQueryCalls).toBe(1);
    expect(spy.runTaskCalls).toBe(0); // worktree-capture path never reached
    expect(out.routedPages).toEqual(["active-recall", "spaced-repetition"]);
    // The fabricated [[not-routed-fake]] is dropped; citations subset of routed.
    expect(out.citedSlugs).toEqual(["active-recall"]);
    expect(out.citedSlugs.every((s) => out.routedPages.includes(s))).toBe(true);
    expect(out.notInVault).toBe(false);
  });

  it("sendMessage emits AgentStarted + AgentEvent(answer) and NO proposal events", async () => {
    spy.answer = "Grounded answer citing [[active-recall]].";
    const events: CoreEvent[] = [];
    core.onEvent((e) => events.push(e));

    const res = await core.sendMessage({ vault: "personal", text: "active recall?" });
    expect(res.runId).toBeTruthy();

    const types = events.map((e) => e.type);
    expect(types).toContain("AgentStarted");
    expect(types).toContain("AgentEvent");
    for (const forbidden of ["DiffReady", "ApprovalRequired", "WikiCommitted", "ProposalFlagged"]) {
      expect(types).not.toContain(forbidden);
    }
    const answerEvent = events.find((e) => e.type === "AgentEvent") as { payload: { kind: string; answer: string } };
    expect(answerEvent.payload.kind).toBe("answer");
    expect(answerEvent.payload.answer).toContain("[[active-recall]]");
  });

  it("returns 'Not in this vault.' with NO backend call when nothing is relevant", async () => {
    const out = await core.answerQuestion("personal", "What is the capital of France?");
    expect(out.answer).toBe(NOT_IN_VAULT);
    expect(out.notInVault).toBe(true);
    expect(out.routedPages).toEqual([]);
    expect(out.citedSlugs).toEqual([]);
    expect(spy.runQueryCalls).toBe(0); // short-circuit: read-only AND free
  });
});
