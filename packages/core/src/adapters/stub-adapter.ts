// @mneme/core — StubAdapter
// Deterministic executor used to exercise the propose -> gate -> commit pipeline
// without a real backend. Returns a fixed placeholder page. (Pulled out of
// ClaudeCodeAdapter so that adapter can be the REAL headless implementation.)

import { AgentProvider, AgentRunResult, AgentTask, AuthInput, AuthStatus, ProviderCapabilities } from "@mneme/provider";

export class StubAdapter implements AgentProvider {
  readonly id = "stub";

  getCapabilities(): ProviderCapabilities {
    return {
      unattendedExecution: true,
      subagents: false,
      diffCapture: true,
      authModes: ["delegated"],
      workspaceScoping: true,
      streaming: false,
    };
  }

  async authenticate(_input: AuthInput): Promise<AuthStatus> {
    return { authenticated: true, mode: "delegated", account: "stub", message: "stub adapter is always authenticated" };
  }

  async runTask(input: AgentTask): Promise<AgentRunResult> {
    const today = new Date().toISOString().slice(0, 10);
    const page = [
      "---",
      "type: source-summary",
      `title: "Placeholder for ${input.runId}"`,
      "tags: []",
      "sources: []",
      // Unquoted on purpose: YAML parses these as Date objects, and the wiki
      // frontmatter schema coerces Date -> "YYYY-MM-DD", so this still validates.
      `created: ${today}`,
      `updated: ${today}`,
      "vault: unknown",
      "---",
      "",
      `Stub page. Instruction was: ${input.instruction}`,
      "",
    ].join("\n");
    return {
      runId: input.runId,
      status: "ok",
      proposedChanges: [{ path: `raw/pages/placeholder-${input.runId}.md`, op: "create", content: page }],
      summary: "stub run (no model call)",
      citedSources: [],
      usage: { costUsd: 0 },
    };
  }

  async cancelRun(_runId: string): Promise<void> {}
}
