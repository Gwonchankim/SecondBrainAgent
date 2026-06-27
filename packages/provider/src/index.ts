// @mneme/provider
//
// The thin contract every backend (Claude Code, Codex, Hermes, Antigravity)
// must satisfy. A Provider is ONLY an executor: it runs a task, touches files,
// runs tools, and returns a PROPOSED change set + metadata. It never decides
// truth and never commits to the Wiki.
//
// LOCKED INVARIANT: this interface must NEVER grow methods like improveSelf(),
// writeMemory(), scheduleNudge(), or createSkill(). Those are Host services.
// The thinness of this interface is the firewall that protects product identity.

/** What a backend can do. Drives capability-gating of Host automation. */
export interface ProviderCapabilities {
  /** Stable, non-interactive automation (CLI exec / SDK headless). */
  unattendedExecution: boolean;
  /** Can spawn parallel subagents. Gates Auto/Ask parallel mode. */
  subagents: boolean;
  /** Can return a recoverable file diff. REQUIRED for Review/Auto reflect mode. */
  diffCapture: boolean;
  /** Which auth tracks this backend supports. See AuthMode. */
  authModes: AuthMode[];
  /** Can be safely scoped to a local workspace folder. */
  workspaceScoping: boolean;
  /** Streaming events available via streamTask(). */
  streaming: boolean;
}

export type AuthMode =
  // Backend CLI owns the OAuth session (Claude Code / Codex subscription).
  // The Host NEVER holds or routes the token — it just invokes the CLI, which is
  // the only use of subscription OAuth permitted by Anthropic/OpenAI terms.
  | "delegated"
  // Host stores the API key in CredentialStore and injects it at call time.
  // This is the path vendors recommend for unattended/programmatic use.
  | "api-key";

export interface AuthInput {
  mode: AuthMode;
  /** Only for api-key mode: a CredentialStore reference the Host resolves.
   *  Never a raw secret, and never used in delegated mode (the CLI owns creds). */
  secretRef?: string;
}

export interface AuthStatus {
  authenticated: boolean;
  /** Which track satisfied (or failed) authentication. */
  mode?: AuthMode;
  account?: string;
  expiresAt?: string; // ISO8601, where the track exposes token expiry
  /** delegated + not logged in: the shell command to surface to the user,
   *  e.g. "claude" or "codex login". The Host shows this; it never logs in for you. */
  loginHint?: string;
  message?: string;
}

/** A single proposed file change. Never applied by the provider. */
export interface ProposedFileChange {
  /** Path relative to the task workspace root. */
  path: string;
  op: "create" | "modify" | "delete";
  /** Full new content for create/modify. Omitted for delete. */
  content?: string;
}

export interface AgentTask {
  runId: string;
  /** Absolute workspace path the provider is scoped to (e.g. a vault). */
  workspace: string;
  /** Natural-language instruction assembled by the Host (with injected context). */
  instruction: string;
  /** Host-controlled execution hints. The provider obeys; it does not decide policy. */
  options?: {
    /** Host already resolved parallel policy; provider only uses subagents if true. */
    allowSubagents?: boolean;
    /** Soft cap the provider should respect; Host enforces the hard cap. */
    maxCostUsd?: number;
    timeoutMs?: number;
  };
}

export interface RunUsage {
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
}

/** The ONLY shape a provider may return. Note: proposed, not committed. */
export interface AgentRunResult {
  runId: string;
  status: "ok" | "error" | "cancelled";
  /** Proposed changes — the Host validates, diffs, gates, and commits. */
  proposedChanges: ProposedFileChange[];
  summary: string;
  /** Source ids / URLs the result is grounded in. */
  citedSources: string[];
  usage: RunUsage;
  confidence?: number; // 0..1
  warnings?: string[];
  error?: string;
}

/**
 * A READ-ONLY query task: answer a question from context the Host injects inline.
 * Deliberately minimal — there is NO `workspace` and NO permission/edit field, so a
 * query is read-only BY TYPE: the provider is never given the vault path and has no
 * knob to request file-editing permission. The adapter runs it in a non-editing,
 * non-vault context internally; that is not configurable here.
 */
export interface QueryTask {
  runId: string;
  /** Host-assembled prompt: the question + the selected pages' content inline. */
  instruction: string;
  /** Cost/time hints only. No permission or workspace fields by design. */
  options?: {
    maxCostUsd?: number;
    timeoutMs?: number;
  };
}

/**
 * The ONLY shape a query may return. Note: NO `proposedChanges` — a query cannot
 * carry a file change, so it structurally cannot feed the proposal/commit path.
 */
export interface QueryResult {
  runId: string;
  status: "ok" | "error" | "cancelled";
  /** The synthesized natural-language answer (cites used pages by [[slug]]). */
  answer: string;
  usage: RunUsage;
  error?: string;
}

/** Incremental events for the Host event stream. */
export type AgentEvent =
  | { type: "agent.started"; runId: string }
  | { type: "agent.log"; runId: string; level: "info" | "warn" | "error"; message: string }
  | { type: "agent.tool"; runId: string; tool: string; detail?: string }
  | { type: "agent.subagent"; runId: string; subId: string; state: "spawned" | "running" | "done" | "failed" }
  | { type: "agent.usage"; runId: string; usage: RunUsage }
  | { type: "agent.finished"; runId: string; status: AgentRunResult["status"] };

export interface AgentProvider {
  readonly id: string; // e.g. "claude-code"
  getCapabilities(): ProviderCapabilities;
  authenticate(input: AuthInput): Promise<AuthStatus>;
  runTask(input: AgentTask): Promise<AgentRunResult>;
  /**
   * Optional READ-ONLY execution: answer a question from inline context and return
   * text only. Never edits files, never returns proposedChanges. A backend that can
   * answer queries implements this; one that cannot simply omits it (the Host then
   * reports it cannot answer queries). This is still a thin executor — it returns an
   * answer, never a proposal or commit — so it stays within the firewall.
   */
  runQuery?(input: QueryTask): Promise<QueryResult>;
  /** Optional streaming variant. Presence implies capabilities.streaming. */
  streamTask?(input: AgentTask): AsyncIterable<AgentEvent>;
  cancelRun(runId: string): Promise<void>;
}
