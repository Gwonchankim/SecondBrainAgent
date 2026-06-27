export * from "./routing";
export * from "./instruction";

/** Result of a read-only query run (Host-level surface). */
export interface QueryOutcome {
  runId: string;
  answer: string;
  /** Slugs routed into the prompt (the candidate set). */
  routedPages: string[];
  /** Slugs the answer cited — always a subset of routedPages. */
  citedSlugs: string[];
  usage: { costUsd: number };
  /** True when nothing was routed / the answer is the "Not in this vault." sentinel. */
  notInVault: boolean;
}
