// @mneme/core — CodexAdapter (thin executor, ChatGPT/OpenAI side)
//
// Same shape as ClaudeCodeAdapter. authenticate() uses the clean exit-code
// contract Codex exposes: `codex login status` exits 0 when authenticated.
// delegated = ChatGPT OAuth session owned by the `codex` CLI (~/.codex/auth.json).
// api-key = Core-injected OPENAI_API_KEY (vendor-recommended for automation).

import {
  AgentProvider,
  AgentRunResult,
  AgentTask,
  AuthInput,
  AuthStatus,
  ProviderCapabilities,
} from "@mneme/provider";
import { probeCli } from "./cli-probe";

export class CodexAdapter implements AgentProvider {
  readonly id = "codex";

  getCapabilities(): ProviderCapabilities {
    return {
      unattendedExecution: true,
      subagents: false,
      diffCapture: true,
      authModes: ["delegated", "api-key"],
      workspaceScoping: true,
      streaming: true,
    };
  }

  async authenticate(input: AuthInput): Promise<AuthStatus> {
    if (input.mode === "api-key") {
      const hasKey = Boolean(process.env.OPENAI_API_KEY) || Boolean(input.secretRef);
      return hasKey
        ? { authenticated: true, mode: "api-key", account: "openai-api", message: "API key present" }
        : { authenticated: false, mode: "api-key", loginHint: "set OPENAI_API_KEY", message: "no API key available" };
    }

    // delegated: `codex login status` exits 0 when a session is present.
    const status = await probeCli("codex", ["login", "status"]);
    if (!status.ran) {
      return { authenticated: false, mode: "delegated", loginHint: "codex login", message: "`codex` CLI not found on PATH" };
    }
    return status.code === 0
      ? { authenticated: true, mode: "delegated", account: "chatgpt", message: "codex login status: authenticated" }
      : { authenticated: false, mode: "delegated", loginHint: "codex login", message: "`codex` found but not logged in — run `codex login`" };
  }

  async runTask(input: AgentTask): Promise<AgentRunResult> {
    return {
      runId: input.runId,
      status: "ok",
      proposedChanges: [],
      summary: "stub run (CodexAdapter.runTask not implemented yet)",
      citedSources: [],
      usage: { costUsd: 0 },
      confidence: 0,
      warnings: ["CodexAdapter.runTask is a Phase 0 stub"],
    };
  }

  async cancelRun(_runId: string): Promise<void> {
    /* no-op in stub */
  }
}
