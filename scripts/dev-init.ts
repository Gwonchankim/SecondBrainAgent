// scripts/dev-init.ts
// Headless smoke test of the Phase 0 pipeline (no Electron, no model):
//   init vault -> ingest (raw immediate commit + page proposal) -> approve
//   (proposal branch merge) -> rebuild derived caches.
// Run: npx ts-node scripts/dev-init.ts   (needs ts-node + tsconfig paths)

import * as os from "node:os";
import * as path from "node:path";
import { MnemeCore, StubAdapter, DEFAULT_PERSONAL_POLICY } from "@mneme/core";
import { CacheManager, memoryMapDerivation, graphIndexDerivation, searchIndexDerivation } from "@mneme/cache";

async function main(): Promise<void> {
  const cache = new CacheManager()
    .register(memoryMapDerivation)
    .register(graphIndexDerivation)
    .register(searchIndexDerivation);

  const credentials = { backend: "noop", async set() {}, async get() { return null; }, async delete() { return false; } };
  const providers = new Map([["stub", new StubAdapter()]]);
  const core = new MnemeCore({ credentials, cache, providers, defaultProviderId: "stub" });

  core.onEvent((e) => console.log("[event]", e.type, JSON.stringify(e)));

  const root = path.join(os.tmpdir(), "mneme-dev", "personal");
  // Demo with reflect=review so the approval gate is explicit (not auto-committed).
  await core.registerVault("personal", root, { ...DEFAULT_PERSONAL_POLICY, reflect: "review" });
  await core.initVault("personal");
  console.log("vault ready at", root);

  const ingest = await core.ingestSource({ vault: "personal", kind: "text", value: "First source note." });
  console.log("ingested (raw committed, page proposal pending):", ingest);

  if (ingest.proposalId) {
    const result = await core.approveChange({ proposalId: ingest.proposalId });
    console.log("approved -> committed:", result);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
