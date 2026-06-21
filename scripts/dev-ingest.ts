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

  core.onEvent((e) => console.log("[event]", e.type, JSON.stringify(e)));

  // Surface login state up front (informational; on Windows the probe is conservative).
  const auth = await claude.authenticate({ mode: "delegated" });
  console.log("claude auth:", JSON.stringify(auth));

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
    console.log(inspected.diff || "(empty diff - no page captured)");

    const producedPage = /raw\/pages\/.+\.md/.test(inspected.diff);
    const valid = inspected.warnings.length === 0 && producedPage;
    console.log("\n--- validation ---");
    if (inspected.warnings.length) {
      for (const w of inspected.warnings) console.log("  WARN:", w);
    }
    console.log(valid ? "RESULT: PASS (schema-conforming page, delivered as a proposal)" : "RESULT: FAIL");
    if (!producedPage) {
      console.log("hint: no raw/pages/*.md was produced - ensure `claude` is on PATH and logged in (`claude` to log in).");
    }
  } catch (e) {
    console.error("\ningest failed:", e instanceof Error ? e.message : String(e));
    console.error("hint: this script needs the `claude` CLI on PATH and a logged-in session.");
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
