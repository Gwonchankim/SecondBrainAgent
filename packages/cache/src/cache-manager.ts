// @mneme/cache — CacheManager
// Owns the rebuild contract: wipe .cache, run every registered derivation.

import * as fs from "node:fs/promises";
import { Derivation, DerivationContext } from "./derivation";

export class CacheManager {
  private derivations: Derivation[] = [];

  register(d: Derivation): this {
    this.derivations.push(d);
    return this;
  }

  registered(): string[] {
    return this.derivations.map((d) => d.name);
  }

  /** Invariant 3: deleting .cache then rebuildAll() fully restores derived state. */
  async rebuildAll(ctx: DerivationContext): Promise<string[]> {
    await fs.rm(ctx.cacheDir, { recursive: true, force: true });
    await fs.mkdir(ctx.cacheDir, { recursive: true });
    for (const d of this.derivations) {
      await d.rebuild(ctx);
    }
    return this.registered();
  }
}
