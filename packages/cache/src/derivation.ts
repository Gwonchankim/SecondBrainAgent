// @mneme/cache — derivation contract
//
// A Derivation reads ONLY the durable truth (raw + pages + wiki) and writes a
// rebuildable artifact into .cache. It must be pure w.r.t. the vault: given the
// same truth, rebuild() yields the same output. Never a source of truth.

export interface DerivationContext {
  vaultId: string;
  vaultRoot: string;
  cacheDir: string; // <vault>/.cache
}

export interface Derivation {
  /** Stable name, also the cache subpath, e.g. "memory-map" | "graph-index" | "search-index". */
  readonly name: string;
  rebuild(ctx: DerivationContext): Promise<void>;
}
