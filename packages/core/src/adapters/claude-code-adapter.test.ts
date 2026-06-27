// Unit tests for delegated auth. Two layers, both offline / zero model cost:
//   (1) caching — the BILLED probe runs AT MOST ONCE per process (override the
//       probe so it is hermetic), incl. under concurrency;
//   (2) the REAL probe body — stub only the CLI seams (probeCli + execFile) so the
//       actual probeDelegated() runs and we can lock ENOENT, the is_error mapping,
//       and the read-only permission mode (no acceptEdits) of the billed probe.

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as os from "node:os";
import type { AuthStatus } from "@mneme/provider";

const { probeCliMock, execFileMock } = vi.hoisted(() => ({
  probeCliMock: vi.fn(),
  execFileMock: vi.fn(),
}));
vi.mock("./cli-probe", () => ({ probeCli: probeCliMock }));
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { ClaudeCodeAdapter } from "./claude-code-adapter";

class CountingAdapter extends ClaudeCodeAdapter {
  public probeRuns = 0;
  // Stand in for the billed `claude -p` probe — no subprocess, no cost.
  protected async probeDelegated(): Promise<AuthStatus> {
    this.probeRuns += 1;
    return { authenticated: true, mode: "delegated", account: "test" };
  }
}

describe("ClaudeCodeAdapter delegated auth caching (budget invariant 12)", () => {
  it("probes at most once per process and caches the result", async () => {
    const a = new CountingAdapter();
    const r1 = await a.authenticate({ mode: "delegated" });
    const r2 = await a.authenticate({ mode: "delegated" });
    const r3 = await a.authenticate({ mode: "delegated" });

    expect(r1.authenticated).toBe(true);
    // The override stands in for the billed probe; running it exactly once across
    // three authenticate() calls proves the cache (1st probes, 2nd/3rd are cached).
    expect(a.probeRuns).toBe(1);
    expect(r2).toBe(r1); // same cached object
    expect(r3).toBe(r1);
  });

  it("shares ONE probe across concurrent callers (no race)", async () => {
    const a = new CountingAdapter();
    const [r1, r2, r3] = await Promise.all([
      a.authenticate({ mode: "delegated" }),
      a.authenticate({ mode: "delegated" }),
      a.authenticate({ mode: "delegated" }),
    ]);
    expect(a.probeRuns).toBe(1); // memoized promise — not 3
    expect(r2).toBe(r1);
    expect(r3).toBe(r1);
  });

  it("api-key mode never triggers the delegated probe", async () => {
    const a = new CountingAdapter();
    const status = await a.authenticate({ mode: "api-key" });
    expect(status.mode).toBe("api-key");
    expect(a.probeRuns).toBe(0);
  });
});

describe("ClaudeCodeAdapter.probeDelegated real branches (CLI seams mocked, offline)", () => {
  beforeEach(() => {
    probeCliMock.mockReset();
    execFileMock.mockReset();
  });

  // Make the mocked execFile answer like `claude -p` returning the given JSON.
  const respondWith = (json: Record<string, unknown>): void => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: (e: unknown, out: string, err: string) => void) => {
        cb(null, JSON.stringify(json), "");
      },
    );
  };

  it("ENOENT (claude not on PATH) -> authenticated:false, never spawns the model", async () => {
    probeCliMock.mockResolvedValue({ ran: false, code: null, stdout: "", stderr: "", error: "ENOENT" });
    const a = new ClaudeCodeAdapter();
    const r = await a.authenticate({ mode: "delegated" });
    expect(r.authenticated).toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("is_error:false -> authenticated:true, probes once, read-only permission mode (no acceptEdits)", async () => {
    probeCliMock.mockResolvedValue({ ran: true, code: 0, stdout: "1.0.0", stderr: "" });
    respondWith({ is_error: false, result: "OK", total_cost_usd: 0 });
    const a = new ClaudeCodeAdapter();

    const r1 = await a.authenticate({ mode: "delegated" });
    expect(r1.authenticated).toBe(true);
    expect(a.delegatedProbeCount).toBe(1);

    // Read-only invariant: the BILLED probe must never be allowed to write files.
    const args = execFileMock.mock.calls[0][1] as string[];
    const i = args.indexOf("--permission-mode");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe("default");
    expect(args).not.toContain("acceptEdits");

    // Memoized: a second delegated call must NOT re-spawn the model.
    await a.authenticate({ mode: "delegated" });
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(a.delegatedProbeCount).toBe(1);
  });

  it("is_error:true -> authenticated:false", async () => {
    probeCliMock.mockResolvedValue({ ran: true, code: 1, stdout: "", stderr: "" });
    respondWith({ is_error: true, result: "Not logged in", total_cost_usd: 0 });
    const a = new ClaudeCodeAdapter();
    const r = await a.authenticate({ mode: "delegated" });
    expect(r.authenticated).toBe(false);
  });
});

describe("ClaudeCodeAdapter.runQuery is structurally read-only (CLI seam mocked, offline)", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("runs in default (non-editing) mode in a temp dir, never acceptEdits, returns no proposedChanges", async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: (e: unknown, out: string, err: string) => void) => {
        cb(null, JSON.stringify({ is_error: false, result: "Answer citing [[x]].", total_cost_usd: 0.01 }), "");
      },
    );
    const a = new ClaudeCodeAdapter();
    const res = await a.runQuery({ runId: "q1", instruction: "Question + injected pages" });

    expect(res.status).toBe("ok");
    expect(res.answer).toBe("Answer citing [[x]].");
    expect(res.usage.costUsd).toBe(0.01);

    const [, args, opts] = execFileMock.mock.calls[0] as [string, string[], { cwd: string }, unknown];
    // Read-only: non-editing permission mode, NEVER acceptEdits.
    const i = args.indexOf("--permission-mode");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe("default");
    expect(args).not.toContain("acceptEdits");
    // Runs in a throwaway temp dir, NOT a vault working tree.
    expect(opts.cwd).toBe(os.tmpdir());
    // The result type carries no file changes at all.
    expect("proposedChanges" in res).toBe(false);
  });

  it("maps a model error to status:error without throwing", async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: (e: unknown, out: string, err: string) => void) => {
        cb(null, JSON.stringify({ is_error: true, result: "boom" }), "");
      },
    );
    const a = new ClaudeCodeAdapter();
    const res = await a.runQuery({ runId: "q2", instruction: "Q" });
    expect(res.status).toBe("error");
    expect(res.error).toBe("boom");
  });
});
