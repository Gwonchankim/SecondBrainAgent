// @mneme/core — ClaudeCodeAdapter (REAL thin executor)
//
// authenticate(): the only reliable delegated login check is to ATTEMPT a real
// minimal `claude -p` run and read its JSON is_error — a static file/cred probe
// is a false negative on Windows (creds live in Credential Manager). ENOENT
// (binary missing) is the sole hard "cannot run". That probe is BILLED, and the
// claude CLI exposes no non-billed status check (only doctor/mcp/setup-token), so
// the result is cached for the process lifetime: we probe at most once (budget,
// invariant 12).
// runTask(): real headless run. Invokes `claude -p` inside an isolated detached
// git worktree off the vault's HEAD (so the vault working tree is untouched),
// then captures the file changes as a PROPOSAL. The Host commits, not us.
//
// Headless contract (per Claude Code docs):
//   claude -p "<prompt>" --output-format json --permission-mode acceptEdits
//   JSON result includes total_cost_usd, result, session_id, is_error.
// NOTE: we deliberately do NOT pass --bare. --bare suppresses the delegated OAuth
// subscription session (it expects an env API key), so on a subscription login it
// returns a false "Not logged in". Delegated auth = just invoke the logged-in CLI.

import { execFile } from "node:child_process";
import * as os from "node:os";
import {
  AgentProvider,
  AgentRunResult,
  AgentTask,
  AuthInput,
  AuthStatus,
  ProviderCapabilities,
  QueryResult,
  QueryTask,
} from "@mneme/provider";
import { probeCli } from "./cli-probe";
import { captureChanges } from "./worktree-capture";

interface ClaudeJson {
  total_cost_usd?: number;
  result?: string;
  session_id?: string;
  is_error?: boolean;
  num_turns?: number;
}

function runClaudeHeadless(
  prompt: string,
  opts: { model?: string; maxTurns?: number; timeoutMs?: number; permissionMode?: string }
): (worktreeDir: string) => Promise<ClaudeJson> {
  return (worktreeDir: string) =>
    new Promise<ClaudeJson>((resolve, reject) => {
      const args = [
        "-p", prompt,
        "--output-format", "json",
        "--permission-mode", opts.permissionMode ?? "acceptEdits",
      ];
      if (opts.model) args.push("--model", opts.model);
      if (opts.maxTurns) args.push("--max-turns", String(opts.maxTurns));

      execFile(
        "claude",
        args,
        { cwd: worktreeDir, timeout: opts.timeoutMs ?? 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => {
          const e = err as NodeJS.ErrnoException | null;
          if (e && e.code === "ENOENT") {
            reject(new Error("`claude` CLI not found on PATH"));
            return;
          }
          // Even on a non-zero exit, claude usually still prints a JSON result
          // with is_error:true — try to parse before giving up.
          try {
            resolve(JSON.parse((stdout || "").trim() || "{}") as ClaudeJson);
          } catch {
            reject(new Error(e ? `claude failed: ${e.message}; stderr: ${stderr}` : "unparseable claude output"));
          }
        }
      );
    });
}

export class ClaudeCodeAdapter implements AgentProvider {
  readonly id = "claude-code";

  /** Memoized delegated probe; the probe is billed, so even concurrent callers
   *  share ONE run for the process lifetime. */
  private delegatedAuthProbe?: Promise<AuthStatus>;
  /** Count of billed delegated probes actually run this process (proof it is <= 1). */
  private probeCount = 0;

  /** How many billed delegated probes ran this process (diagnostics / tests). */
  get delegatedProbeCount(): number {
    return this.probeCount;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      unattendedExecution: true,
      subagents: true,
      diffCapture: true,
      authModes: ["delegated", "api-key"],
      workspaceScoping: true,
      streaming: true,
    };
  }

  async authenticate(input: AuthInput): Promise<AuthStatus> {
    if (input.mode === "api-key") {
      const hasKey = Boolean(process.env.ANTHROPIC_API_KEY) || Boolean(input.secretRef);
      return hasKey
        ? { authenticated: true, mode: "api-key", account: "anthropic-api", message: "API key present" }
        : { authenticated: false, mode: "api-key", loginHint: "set ANTHROPIC_API_KEY", message: "no API key available (env or CredentialStore ref)" };
    }

    // delegated: a probe is a billed `claude -p` run, so memoize it and probe AT
    // MOST ONCE per process (budget principle, invariant 12). Memoizing the PROMISE
    // (not just the result) means concurrent callers also share the single probe.
    if (!this.delegatedAuthProbe) this.delegatedAuthProbe = this.probeDelegated();
    return this.delegatedAuthProbe;
  }

  /**
   * One delegated liveness probe. ENOENT (binary missing) is the only hard
   * "cannot run"; otherwise a minimal BILLED `claude -p` run whose is_error tells
   * us login state. Counted + logged so we can prove it runs once per process.
   * `protected` so tests can override it without a paid model call.
   */
  protected async probeDelegated(): Promise<AuthStatus> {
    this.probeCount += 1;
    // Wrap the ENTIRE body so this method can NEVER reject: a rejected promise
    // would be memoized by authenticate() and poison delegated auth for the whole
    // process. Every failure (incl. a broken stderr) becomes a negative AuthStatus.
    try {
      process.stderr.write(`[claude-code] delegated auth probe run #${this.probeCount} (cached for process lifetime)\n`);
      const ver = await probeCli("claude", ["--version"]);
      if (!ver.ran) {
        return { authenticated: false, mode: "delegated", loginHint: "claude", message: "`claude` CLI not found on PATH" };
      }
      // Read-only liveness probe: only is_error matters, so use a non-editing
      // permission mode (no acceptEdits) — the probe must never write files.
      const probe = await runClaudeHeadless("Reply with exactly: OK", { maxTurns: 1, permissionMode: "default" })(os.tmpdir());
      return probe.is_error
        ? { authenticated: false, mode: "delegated", loginHint: "claude", message: probe.result ?? "claude reported an error (not logged in?)" }
        : { authenticated: true, mode: "delegated", account: "subscription", message: "claude -p probe run succeeded" };
    } catch (e) {
      return { authenticated: false, mode: "delegated", loginHint: "claude", message: e instanceof Error ? e.message : String(e) };
    }
  }

  async runTask(input: AgentTask): Promise<AgentRunResult> {
    try {
      const { changes, meta } = await captureChanges(
        input.workspace,
        runClaudeHeadless(input.instruction, { maxTurns: 12 })
      );
      return {
        runId: input.runId,
        status: meta.is_error ? "error" : "ok",
        proposedChanges: changes,
        summary: meta.result ?? "(no summary returned)",
        citedSources: [],
        usage: { costUsd: meta.total_cost_usd ?? 0 },
        error: meta.is_error ? meta.result : undefined,
      };
    } catch (e) {
      return {
        runId: input.runId,
        status: "error",
        proposedChanges: [],
        summary: "claude run failed",
        citedSources: [],
        usage: { costUsd: 0 },
        error: e instanceof Error ? e.message : String(e),
        warnings: ["runTask needs the `claude` CLI on PATH and a logged-in session"],
      };
    }
  }

  /**
   * READ-ONLY query. Structurally cannot edit the vault:
   *   - permission mode is "default" (NOT acceptEdits) — the model cannot write;
   *   - it runs in os.tmpdir(), never the vault working tree (no `workspace` is
   *     even passed in QueryTask), and it does NOT go through captureChanges, so
   *     no proposedChanges can be produced;
   *   - the return type (QueryResult) has no proposedChanges field at all.
   * The whole answer context is injected inline by the Host, so no file access is
   * needed. We capture only the model's text result + cost.
   */
  async runQuery(input: QueryTask): Promise<QueryResult> {
    try {
      const json = await runClaudeHeadless(input.instruction, {
        maxTurns: 1,
        permissionMode: "default",
        timeoutMs: input.options?.timeoutMs,
      })(os.tmpdir());
      return {
        runId: input.runId,
        status: json.is_error ? "error" : "ok",
        answer: json.result ?? "",
        usage: { costUsd: json.total_cost_usd ?? 0 },
        error: json.is_error ? json.result : undefined,
      };
    } catch (e) {
      return {
        runId: input.runId,
        status: "error",
        answer: "",
        usage: { costUsd: 0 },
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async cancelRun(_runId: string): Promise<void> {
    /* Phase 0: cancellation wiring (track child PID) comes with streamTask. */
  }
}
