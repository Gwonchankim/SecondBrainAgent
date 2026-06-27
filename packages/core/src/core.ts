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
import { Vault, WikiService, ProposalRecord, extractWikilinks } from "@mneme/wiki";
import { CredentialStore } from "@mneme/credential";
import { CacheManager } from "@mneme/cache";
import { resolveReflect } from "./policies";
import { buildIngestInstruction, validateProposedPages, checkIngestPaths } from "./ingest";
import { deriveMemoryMap, readPagesDir, buildMemoryMap } from "./memory";
import type { MemoryMap } from "./memory";
import { routePages, buildQueryInstruction, NOT_IN_VAULT } from "./query";
import type { QueryOutcome } from "./query";

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
    // A chat turn is a READ-ONLY query: route -> load -> synthesize. It never
    // proposes or commits; the answer is surfaced via the event stream.
    const outcome = await this.queryPipeline(input.vault, input.text, runId);
    this.push({
      type: "AgentEvent",
      runId,
      payload: {
        kind: "answer",
        answer: outcome.answer,
        citedSlugs: outcome.citedSlugs,
        routedPages: outcome.routedPages,
        notInVault: outcome.notInVault,
        usage: outcome.usage,
      },
    });
    return { runId };
  }

  /**
   * READ-ONLY query (NOT part of CoreApi; the diagnostic/testable surface that
   * sendMessage drives). Route via the memory-map, load the selected pages from
   * durable truth, and ask the backend to answer ONLY from them with [[slug]]
   * citations. Never writes truth, never proposes, never commits (invariant 1/2).
   */
  async answerQuestion(vault: VaultId, text: string): Promise<QueryOutcome> {
    return this.queryPipeline(vault, text, nextRunId());
  }

  private async queryPipeline(vault: VaultId, text: string, runId: RunId): Promise<QueryOutcome> {
    const v = this.vaultEntry(vault);

    // Load durable truth once (traversal-safe reader), derive the map from it, and
    // route. deriving here keeps query independent of any cached artifact (rebuild
    // if absent, invariant 3).
    const pages = await readPagesDir(v.info.path);
    const map = buildMemoryMap(vault, pages);
    const routedPages = routePages(map, text);

    // Nothing relevant -> "not in this vault", with NO backend call (cheap + exact).
    if (routedPages.length === 0) {
      return { runId, answer: NOT_IN_VAULT, routedPages: [], citedSlugs: [], usage: { costUsd: 0 }, notInVault: true };
    }

    const selected = pages.filter((p) => routedPages.includes(p.slug));
    const provider = this.provider();
    if (!provider.runQuery) {
      throw new Error(`Provider ${provider.id} cannot answer queries (no runQuery)`);
    }

    const instruction = buildQueryInstruction(text, selected);
    // runQuery is read-only by contract: no workspace, no edit permission, no
    // proposedChanges. The Host never turns its result into a proposal.
    const result = await provider.runQuery({ runId, instruction });

    // Citations = wikilinks in the answer intersected with the routed set, so a
    // returned slug is ALWAYS a subset of what we actually injected.
    const routedSet = new Set(routedPages);
    const citedSlugs = [...new Set(extractWikilinks(result.answer))].filter((s) => routedSet.has(s));
    const notInVault = result.answer.trim() === NOT_IN_VAULT || citedSlugs.length === 0;

    return { runId, answer: result.answer, routedPages, citedSlugs, usage: result.usage, notInVault };
  }

  async ingestSource(input: IngestInput): Promise<{ proposalId?: ProposalId; rawCommit: string }> {
    const v = this.vaultEntry(input.vault);

    // 1) raw save = IMMEDIATE commit (immutable input, no gate).
    const relPath = `${input.kind}/${Date.now()}.md`;
    const { commit } = await v.wiki.saveRawSource(relPath, input.value);

    // 2) page integration = PROPOSED change through the gate.
    // The HOST builds the instruction (schema + context injected); the adapter
    // stays thin and only runs it. The raw rel path doubles as the provenance
    // source-id the produced page must cite. The existing-pages map is derived
    // fresh from durable truth (raw/pages/) so the backend links to real pages by
    // [[slug]] rather than duplicating them; deriving (not loading .cache) keeps
    // ingest independent of any non-rebuildable cache (invariant 3).
    const memoryMap = await deriveMemoryMap(input.vault, v.info.path);
    const instruction = buildIngestInstruction({
      rawRelPath: relPath,
      rawContent: input.value,
      vaultId: input.vault,
      sourceId: relPath,
      memoryMap,
    });
    const proposalId = await this.makeProposal(input.vault, instruction, { ingest: true });
    return { proposalId, rawCommit: commit };
  }

  async proposeWikiChange(input: { vault: VaultId; instruction: string }): Promise<{ proposalId: ProposalId }> {
    return { proposalId: await this.makeProposal(input.vault, input.instruction) };
  }

  private async makeProposal(vaultId: VaultId, instruction: string, opts: { ingest?: boolean } = {}): Promise<ProposalId> {
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

    // Host-side guards on the captured changes, run BEFORE the proposal is created.
    // Neither trusts the model: frontmatter is validated against the LOCKED schema,
    // and (for ingest) every change is checked against the raw/pages/ allowlist.
    const validation = validateProposedPages(result.proposedChanges);
    const pathGuard = opts.ingest
      ? checkIngestPaths(result.proposedChanges)
      : { ok: true, warnings: [] as string[], disallowed: [] as string[] };
    const guardsOk = validation.ok && pathGuard.ok;
    const warnings = [...(result.warnings ?? []), ...validation.warnings, ...pathGuard.warnings];
    this.push({ type: "AgentEvent", runId, payload: { summary: result.summary, usage: result.usage, validation, pathGuard } });

    const proposalId = nextProposalId();
    const record = await v.wiki.createProposal(proposalId, result.proposedChanges, instruction);
    this.proposals.set(proposalId, { vault: vaultId, record, warnings });

    this.push({ type: "DiffReady", proposalId, vault: vaultId });

    // A flagged proposal (invalid frontmatter or a disallowed path) is forced to
    // DRAFT: it waits for a human and is never auto-committed, regardless of the
    // vault's reflect policy. This is a guard signal, not a policy downgrade, so it
    // emits ProposalFlagged (PolicyDowngraded stays reserved for invariant 10).
    if (!guardsOk) {
      this.push({ type: "ProposalFlagged", proposalId, vault: vaultId, warnings });
    }
    const effectiveReflect = guardsOk ? reflect : "draft";

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
   * Accessor (NOT part of CoreApi): the vault's compact memory map, derived fresh
   * from durable truth (raw/pages/). This is the read side the Host will later
   * inject as ingest/query context — it is intentionally NOT yet called from
   * ingestSource/sendMessage. Vault-internal: reads one vault root only.
   */
  async getMemoryMap(vault: VaultId): Promise<MemoryMap> {
    const v = this.vaultEntry(vault);
    return deriveMemoryMap(vault, v.info.path);
  }

  /**
   * Diagnostics helper (NOT part of CoreApi): inspect a pending proposal's diff
   * and any validation warnings. Used by dev scripts to surface what a backend
   * produced without widening the client-facing API surface.
   */
  async inspectProposal(proposalId: ProposalId): Promise<{ branch: string; diff: string; warnings: string[]; pages: { path: string; content: string }[] } | undefined> {
    const entry = this.proposals.get(proposalId);
    if (!entry) return undefined;
    const v = this.vaultEntry(entry.vault);
    const diff = await v.wiki.diffProposal(entry.record);
    const pages = await v.wiki.readProposalPages(entry.record);
    return { branch: entry.record.branch, diff, warnings: entry.warnings ?? [], pages };
  }
}
