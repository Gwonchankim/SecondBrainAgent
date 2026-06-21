// @mneme/core — ClaudeCodeAdapter (REAL thin executor)
//
// authenticate(): real CLI probe (delegated = CLI owns the OAuth session).
// runTask(): real headless run. Invokes `claude -p` inside an isolated detached
// git worktree off the vault's HEAD (so the vault working tree is untouched),
// then captures the file changes as a PROPOSAL. The Host commits, not us.
//
// Headless contract (per Claude Code docs):
//   claude -p "<prompt>" --bare --output-format json --permission-mode acceptEdits
//   JSON result includes total_cost_usd, result, session_id, is_error.
//   --bare skips local hooks/skills/MCP/CLAUDE.md for reproducible scripted runs.

import { execFile } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  AgentProvider,
  AgentRunResult,
  AgentTask,
  AuthInput,
  AuthStatus,
  ProviderCapabilities,
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
  opts: { model?: string; maxTurns?: number; timeoutMs?: number }
): (worktreeDir: string) => Promise<ClaudeJson> {
  return (worktreeDir: string) =>
    new Promise<ClaudeJson>((resolve, reject) => {
      const args = [
        "-p", prompt,
        "--bare",
        "--output-format", "json",
        "--permission-mode", "acceptEdits",
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

    const ver = await probeCli("claude", ["--version"]);
    if (!ver.ran) {
      return { authenticated: false, mode: "delegated", loginHint: "claude", message: "`claude` CLI not found on PATH" };
    }
    if (process.platform === "win32") {
      // Windows stores Claude creds in Credential Manager (not file-probeable here).
      return { authenticated: false, mode: "delegated", loginHint: "claude", message: "`claude` found; confirm login interactively (Windows Credential Manager-based)" };
    }
    const credFile = path.join(os.homedir(), ".claude", ".credentials.json");
    let session = false;
    try { session = fs.existsSync(credFile); } catch { session = false; }
    return session
      ? { authenticated: true, mode: "delegated", account: "subscription", message: "claude session present (verify with `claude` /status)" }
      : { authenticated: false, mode: "delegated", loginHint: "claude", message: "`claude` found but no local session — run `claude` to log in" };
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

  async cancelRun(_runId: string): Promise<void> {
    /* Phase 0: cancellation wiring (track child PID) comes with streamTask. */
  }
}
