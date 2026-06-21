// @mneme/cache — Phase 0 stub derivations.
// Real builders (parse pages -> map/graph/search) land in Phase 1-2.
// They exist now so the rebuild contract is exercisable end-to-end.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Derivation, DerivationContext } from "./derivation";

function makeStub(name: string): Derivation {
  return {
    name,
    async rebuild(ctx: DerivationContext) {
      const out = path.join(ctx.cacheDir, `${name}.json`);
      await fs.writeFile(
        out,
        JSON.stringify({ derivation: name, vault: ctx.vaultId, builtAt: new Date().toISOString(), stub: true }, null, 2),
        "utf-8"
      );
    },
  };
}

export const memoryMapDerivation = makeStub("memory-map");
export const graphIndexDerivation = makeStub("graph-index");
export const searchIndexDerivation = makeStub("search-index");
