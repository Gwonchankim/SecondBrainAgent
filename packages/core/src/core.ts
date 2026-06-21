// @mneme/core — MnemeCore
//
// The Host. Implements CoreApi, owns the event stream, and wires the services.
// Providers are thin executors that only ever return PROPOSED changes; the Host
// validates, gates, commits, and rebuilds derived caches.

import { EventEmitter } from "node:events";
import * as path from "node:path";
import {
  CoreApi,
  CoreEvent,
  CoreEventSource,
  IngestInput,
  KnowledgeGraph,
  ProposalId,
  RunId,
  VaultId,
  VaultInfo,
  VaultPolicy,
} from "@mneme/ipc";
import { AgentProvider } from "@mneme/provider";
import { Vault, WikiService, ProposalRecord } from "@mneme/wiki";
import { CredentialStore } from "@mneme/credential";
import { CacheManager } from "@mneme/cache";
import { resolveReflect } from "./policies";
import { buildIngestInstruction, validateProposedPages } from "./ingest";

interface VaultEntry {
  info: VaultInfo;
  wiki: WikiService;
}

interface ProposalEntry {
  vault: VaultId;
  record: ProposalRecord;
  /** Validation warnings captured at proposal time (e.g. invalid page frontmatter). */
  warnings?: string[];
}

export interface MnemeCoreDeps {
  credentials: CredentialStore;
  cache: CacheManager;
  /** Registered backends, keyed by id. */
  providers: Map<string, AgentProvider>;
  defaultProviderId: string;
}

let runCounter = 0;
const nextRunId = (): RunId => `run-${Date.now()}-${++runCounter}`;
const nextProposalId = (): ProposalId => `p-${Date.now()}-${++runCounter}`;

export class MnemeCore implements CoreApi, CoreEventSource {
  private emitter = new EventEmitter();
  private vaults = new Map<VaultId, VaultEntry>();
  private proposals = new Map<ProposalId, ProposalEntry>();

  constructor(private deps: MnemeCoreDeps) {}

  onEvent(listener: (e: CoreEvent) => void): void {
    this.emitter.on("event", listener);
  }
  private push(e: CoreEvent): void {
    this.emitter.emit("event", e);
  }

  private vaultEntry(id: VaultId): VaultEntry {
    const v = this.vaults.get(id);
    if (!v) throw new Error(`Unknown vault: ${id}`);
    return v;
  }

  private provider(): AgentProvider {
    const p = this.deps.providers.get(this.deps.defaultProviderId);
    if (!p) throw new Error(`No provider registered: ${this.deps.defaultProviderId}`);
    return p;
  }

  /** Register + initialize a vault (creates skeleton + git repo if new). */
  async registerVault(id: VaultId, root: string, policy: VaultPolicy): Promise<VaultInfo> {
    const wiki = new WikiService(new Vault(id, root));
    const info: VaultInfo = { id, path: root, policy };
    this.vaults.set(id, { info, wiki });
    return info;
  }

  async initVault(id: VaultId): Promise<void> {
    await this.vaultEntry(id).wiki.initVault();
  }

  // ---- CoreApi ----

  async getVaults(): Promise<VaultInfo[]> {
    return [...this.vaults.values()].map((v) => v.info);
  }

  async updatePolicy(input: { vault: VaultId; policy: Partial<VaultPolicy> }): Promise<VaultInfo> {
    const v = this.vaultEntry(input.vault);
    v.info = { ...v.info, policy: { ...v.info.policy, ...input.policy } };
    return v.info;
  }

  async sendMessage(input: { vault: VaultId; text: string }): Promise<{ runId: RunId }> {
    const runId = nextRunId();
    this.push({ type: "AgentStarted", runId, vault: input.vault });
    // Phase 0: a chat turn is a query run. Real synthesis lands in Phase 1.
    return { runId };
  }

  async ingestSource(input: IngestInput): Promise<{ proposalId?: ProposalId; rawCommit: string }> {
    const v = this.vaultEntry(input.vault);

    // 1) raw save = IMMEDIATE commit (immutable input, no gate).
    const relPath = `${input.kind}/${Date.now()}.md`;
    const { commit } = await v.wiki.saveRawSource(relPath, input.value);

    // 2) page integration = PROPOSED change through the gate.
    // The HOST builds the instruction (schema + context injected); the adapter
    // stays thin and only runs it. The raw rel path doubles as the provenance
    // source-id the produced page must cite.
    const instruction = buildIngestInstruction({
      rawRelPath: relPath,
      rawContent: input.value,
      vaultId: input.vault,
      sourceId: relPath,
    });
    const proposalId = await this.makeProposal(input.vault, instruction);
    return { proposalId, rawCommit: commit };
  }

  async proposeWikiChange(input: { vault: VaultId; instruction: string }): Promise<{ proposalId: ProposalId }> {
    return { proposalId: await this.makeProposal(input.vault, input.instruction) };
  }

  private async makeProposal(vaultId: VaultId, instruction: string): Promise<ProposalId> {
    const v = this.vaultEntry(vaultId);
    const provider = this.provider();
    const caps = provider.getCapabilities();
    const reflect = resolveReflect(v.info.policy.reflect, caps);

    const runId = nextRunId();
    this.push({ type: "AgentStarted", runId, vault: vaultId });
    const result = await provider.runTask({
      runId,
      workspace: v.info.path,
      instruction,
    });

    // Validate any produced page(s) against the LOCKED frontmatter schema BEFORE
    // creating the proposal. Invalid pages must never auto-commit (truth model).
    const validation = validateProposedPages(result.proposedChanges);
    const warnings = [...(result.warnings ?? []), ...validation.warnings];
    this.push({ type: "AgentEvent", runId, payload: { summary: result.summary, usage: result.usage, validation } });

    const proposalId = nextProposalId();
    const record = await v.wiki.createProposal(proposalId, result.proposedChanges, instruction);
    this.proposals.set(proposalId, { vault: vaultId, record, warnings });

    this.push({ type: "DiffReady", proposalId, vault: vaultId });

    // A proposal carrying an invalid page is forced to DRAFT: it waits for a human
    // and is never auto-committed, regardless of the vault's reflect policy. This
    // is an automation downgrade (invariant 10: downgrade only, never upgrade).
    const effectiveReflect = validation.ok ? reflect : "draft";
    if (!validation.ok && reflect === "auto") {
      this.push({ type: "PolicyDowngraded", vault: vaultId, from: "auto", to: "draft", reason: "ingested page failed frontmatter validation" });
    }

    if (effectiveReflect === "auto") {
      await this.approveChange({ proposalId });
    } else if (effectiveReflect === "review") {
      // draft + review both wait for a human; review surfaces an approval ask.
      this.push({ type: "ApprovalRequired", proposalId, vault: vaultId });
    }
    return proposalId;
  }

  async approveChange(input: { proposalId: ProposalId }): Promise<{ committed: boolean; rebased?: boolean; needsRegenerate?: boolean }> {
    const entry = this.proposals.get(input.proposalId);
    if (!entry) throw new Error(`Unknown proposal: ${input.proposalId}`);
    const v = this.vaultEntry(entry.vault);

    const res = await v.wiki.approveProposal(entry.record);
    if (res.committed) {
      this.proposals.delete(input.proposalId);
      this.push({ type: "WikiCommitted", vault: entry.vault, commit: res.commit ?? "" });
      const derivations = await this.deps.cache.rebuildAll({
        vaultId: entry.vault,
        vaultRoot: v.info.path,
        cacheDir: path.join(v.info.path, ".cache"),
      });
      this.push({ type: "IndexRebuilt", vault: entry.vault, derivations });
    }
    return { committed: res.committed, rebased: res.rebased, needsRegenerate: res.needsRegenerate };
  }

  async rejectChange(input: { proposalId: ProposalId }): Promise<{ rejected: boolean }> {
    const entry = this.proposals.get(input.proposalId);
    if (!entry) return { rejected: false };
    const v = this.vaultEntry(entry.vault);
    await v.wiki.rejectProposal(entry.record);
    this.proposals.delete(input.proposalId);
    return { rejected: true };
  }

  async runDreamSequence(input: { vault: VaultId }): Promise<{ runId: RunId }> {
    const runId = nextRunId();
    this.push({ type: "AgentStarted", runId, vault: input.vault });
    // Phase 3: lint/synthesis -> batched proposals (work) or auto (personal).
    return { runId };
  }

  async getGraph(input: { vault: VaultId }): Promise<KnowledgeGraph> {
    // Phase 2: read the derived graph-index from .cache.
    this.vaultEntry(input.vault);
    return { vault: input.vault, nodes: [], edges: [] };
  }

  /**
   * Diagnostics helper (NOT part of CoreApi): inspect a pending proposal's diff
   * and any validation warnings. Used by dev scripts to surface what a backend
   * produced without widening the client-facing API surface.
   */
  async inspectProposal(proposalId: ProposalId): Promise<{ branch: string; diff: string; warnings: string[] } | undefined> {
    const entry = this.proposals.get(proposalId);
    if (!entry) return undefined;
    const v = this.vaultEntry(entry.vault);
    const diff = await v.wiki.diffProposal(entry.record);
    return { branch: entry.record.branch, diff, warnings: entry.warnings ?? [] };
  }
}
