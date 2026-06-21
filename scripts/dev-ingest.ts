// scripts/dev-ingest.ts
// End-to-end smoke test of REAL ingest: the Host builds the instruction, the real
// ClaudeCodeAdapter runs `claude -p` in an isolated worktree, the page is captured,
// validated against PageFrontmatterSchema, and delivered as a PROPOSAL (review mode
// => never auto-committed). Prints the captured proposal diff + validation verdict.
//
// Requires: `claude` on PATH and logged in. (Use dev-init for a no-model pipeline.)
// Run: npm run dev:ingest

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { MnemeCore, ClaudeCodeAdapter, DEFAULT_PERSONAL_POLICY } from "@mneme/core";
import { CacheManager, memoryMapDerivation, graphIndexDerivation, searchIndexDerivation } from "@mneme/cache";

const SAMPLE =
  "Spaced repetition schedules reviews at increasing intervals to fight the " +
  "forgetting curve. Tools like Anki implement it with the SM-2 algorithm.";

async function main(): Promise<void> {
  const cache = new CacheManager()
    .register(memoryMapDerivation)
    .register(graphIndexDerivation)
    .register(searchIndexDerivation);

  const credentials = { backend: "noop", async set() {}, async get() { return null; }, async delete() { return false; } };
  const claude = new ClaudeCodeAdapter();
  const providers = new Map([["claude-code", claude]]);
  const core = new MnemeCore({ credentials, cache, providers, defaultProviderId: "claude-code" });

  let costUsd = 0;
  core.onEvent((e) => {
    console.log("[event]", e.type, JSON.stringify(e));
    if (e.type === "AgentEvent") {
      const usage = (e.payload as { usage?: { costUsd?: number } } | undefined)?.usage;
      if (typeof usage?.costUsd === "number") costUsd += usage.costUsd;
    }
  });

  // Surface login state up front: authenticate() ATTEMPTs a real `claude -p` run,
  // but caches it — a second call must NOT trigger another billed probe.
  const auth = await claude.authenticate({ mode: "delegated" });
  await claude.authenticate({ mode: "delegated" }); // cached; no extra probe
  console.log("claude auth:", JSON.stringify(auth));
  console.log("delegated auth probes this process:", claude.delegatedProbeCount, "(expect 1)");

  const root = path.join(os.tmpdir(), "mneme-ingest", "personal");
  await fs.rm(path.join(os.tmpdir(), "mneme-ingest"), { recursive: true, force: true });

  // reflect=review => the page lands as a PROPOSAL and is NOT auto-committed.
  await core.registerVault("personal", root, { ...DEFAULT_PERSONAL_POLICY, reflect: "review" });
  await core.initVault("personal");
  console.log("vault ready at", root);

  try {
    const ingest = await core.ingestSource({ vault: "personal", kind: "text", value: SAMPLE });
    console.log("\ningested (raw committed, page proposal pending):", JSON.stringify(ingest));

    if (!ingest.proposalId) {
      console.log("no proposal produced.");
      return;
    }

    const inspected = await core.inspectProposal(ingest.proposalId);
    if (!inspected) {
      console.log("proposal not found (already resolved?).");
      return;
    }

    console.log("\n--- captured proposal:", inspected.branch, "---");

    console.log("\n--- generated page(s) (verbatim) ---");
    for (const pg of inspected.pages) {
      console.log(`\n# ${pg.path}\n${pg.content}`);
    }

    const producedPage = inspected.pages.length > 0;
    const valid = inspected.warnings.length === 0 && producedPage;
    console.log("--- validation ---");
    if (inspected.warnings.length) {
      for (const w of inspected.warnings) console.log("  WARN:", w);
    }
    console.log(valid ? "RESULT: PASS (schema-conforming page, delivered as a proposal)" : "RESULT: FAIL");
    if (!producedPage) {
      console.log("hint: no raw/pages/*.md was produced - ensure `claude` is on PATH and logged in (`claude` to log in).");
    }
    console.log("\ntotal_cost_usd:", costUsd.toFixed(4));
    console.log("\n--- proposal diff ---");
    console.log(inspected.diff || "(empty)");
  } catch (e) {
    console.error("\ningest failed:", e instanceof Error ? e.message : String(e));
    console.error("hint: this script needs the `claude` CLI on PATH and a logged-in session.");
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
