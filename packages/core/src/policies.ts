// @mneme/core — policy engines
// Downgrade order (invariant 10): capability missing -> budget exceeded -> vault default.
// Never auto-upgrade to a more expensive path.

import { ParallelMode, ReflectMode, VaultPolicy } from "@mneme/ipc";
import { ProviderCapabilities } from "@mneme/provider";

export const DEFAULT_WORK_POLICY: VaultPolicy = {
  reflect: "review",
  parallel: "ask",
  dreamReflect: "batched-digest",
  budget: { perRunCapUsd: 1, perVaultDailyCapUsd: 10, perVaultMonthlyCapUsd: 100 },
};

export const DEFAULT_PERSONAL_POLICY: VaultPolicy = {
  reflect: "auto",
  parallel: "auto",
  dreamReflect: "auto",
  budget: { perRunCapUsd: 1, perVaultDailyCapUsd: 5, perVaultMonthlyCapUsd: 50 },
};

export interface ParallelResolution {
  mode: ParallelMode;
  downgradedFrom?: ParallelMode;
  reason?: string;
}

export function resolveParallel(
  requested: ParallelMode,
  caps: ProviderCapabilities,
  budgetOk: boolean
): ParallelResolution {
  if (requested === "off") return { mode: "off" };
  if (!caps.subagents) {
    return { mode: "off", downgradedFrom: requested, reason: "backend lacks subagent capability" };
  }
  if (!budgetOk && requested === "auto") {
    return { mode: "ask", downgradedFrom: "auto", reason: "budget exceeded" };
  }
  return { mode: requested };
}

export function resolveReflect(requested: ReflectMode, caps: ProviderCapabilities): ReflectMode {
  // Review/Auto require recoverable diffs; without diffCapture, fall back to draft.
  if ((requested === "review" || requested === "auto") && !caps.diffCapture) return "draft";
  return requested;
}

interface Spend { daily: number; monthly: number }

/** In-memory budget tracker (Phase 0). Persistence + reset windows land later. */
export class BudgetRouter {
  private perVault = new Map<string, Spend>();
  private globalMonthly = 0;

  constructor(private globalMonthlyHardCapUsd = 500) {}

  private spend(vault: string): Spend {
    let s = this.perVault.get(vault);
    if (!s) { s = { daily: 0, monthly: 0 }; this.perVault.set(vault, s); }
    return s;
  }

  budgetOk(vault: string, policy: VaultPolicy, estUsd: number): boolean {
    if (estUsd > policy.budget.perRunCapUsd) return false;
    const s = this.spend(vault);
    if (s.daily + estUsd > policy.budget.perVaultDailyCapUsd) return false;
    if (s.monthly + estUsd > policy.budget.perVaultMonthlyCapUsd) return false;
    if (this.globalMonthly + estUsd > this.globalMonthlyHardCapUsd) return false;
    return true;
  }

  record(vault: string, usd: number): void {
    const s = this.spend(vault);
    s.daily += usd;
    s.monthly += usd;
    this.globalMonthly += usd;
  }
}
