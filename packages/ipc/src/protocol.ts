// @mneme/ipc — protocol
//
// The Core API is defined transport-independently so the same surface serves
// the local Electron client (MVP, stdio) and remote clients (Phase 4, HTTP/WS).

export type VaultId = string;
export type ProposalId = string;
export type RunId = string;

export type ReflectMode = "draft" | "review" | "auto";
export type ParallelMode = "off" | "ask" | "auto";

export interface VaultPolicy {
  reflect: ReflectMode;
  parallel: ParallelMode;
  /** Dream output handling. Work vaults batch; personal can auto-apply. */
  dreamReflect: "batched-digest" | "auto";
  budget: {
    perRunCapUsd: number;
    perVaultDailyCapUsd: number;
    perVaultMonthlyCapUsd: number;
  };
}

export interface VaultInfo {
  id: VaultId;
  path: string;
  policy: VaultPolicy;
}

export interface IngestInput {
  vault: VaultId;
  kind: "url" | "text" | "file";
  /** URL string, raw text, or absolute file path depending on kind. */
  value: string;
  title?: string;
}

export interface ProposalSummary {
  id: ProposalId;
  vault: VaultId;
  branch: string;
  baseCommit: string;
  message: string;
  /** Unified-diff text for the UI. */
  diff: string;
  affectedPages: string[];
  createdAt: string;
}

export interface GraphNode { id: string; title: string; type: string; orphan: boolean }
export interface GraphEdge { from: string; to: string }
export interface KnowledgeGraph { vault: VaultId; nodes: GraphNode[]; edges: GraphEdge[] }

/** The full Core surface needed for the MVP. */
export interface CoreApi {
  sendMessage(input: { vault: VaultId; text: string }): Promise<{ runId: RunId }>;
  ingestSource(input: IngestInput): Promise<{ proposalId?: ProposalId; rawCommit: string }>;
  proposeWikiChange(input: { vault: VaultId; instruction: string }): Promise<{ proposalId: ProposalId }>;
  approveChange(input: { proposalId: ProposalId }): Promise<{ committed: boolean; rebased?: boolean; needsRegenerate?: boolean }>;
  rejectChange(input: { proposalId: ProposalId }): Promise<{ rejected: boolean }>;
  runDreamSequence(input: { vault: VaultId }): Promise<{ runId: RunId }>;
  getGraph(input: { vault: VaultId }): Promise<KnowledgeGraph>;
  getVaults(): Promise<VaultInfo[]>;
  updatePolicy(input: { vault: VaultId; policy: Partial<VaultPolicy> }): Promise<VaultInfo>;
  // getRunEvents is exposed as the event stream below, not a request/response method.
}

/** Server-pushed events. Mirrors PRD 5.2. */
export type CoreEvent =
  | { type: "AgentStarted"; runId: RunId; vault: VaultId }
  | { type: "AgentEvent"; runId: RunId; payload: unknown }
  | { type: "DiffReady"; proposalId: ProposalId; vault: VaultId }
  | { type: "ApprovalRequired"; proposalId: ProposalId; vault: VaultId }
  | { type: "WikiCommitted"; vault: VaultId; commit: string }
  | { type: "IndexRebuilt"; vault: VaultId; derivations: string[] }
  | { type: "BudgetLimitReached"; vault: VaultId; scope: "run" | "vault-daily" | "vault-monthly" | "global-monthly" }
  | { type: "PolicyDowngraded"; vault: VaultId; from: string; to: string; reason: string };

// ---- JSON-RPC envelope (line-delimited JSON over the transport) ----

export interface RpcRequest { id: number; method: keyof CoreApi; params: unknown }
export interface RpcResponse { id: number; result?: unknown; error?: { message: string } }
export interface RpcNotification { event: CoreEvent }
export type RpcMessage = RpcResponse | RpcNotification;
