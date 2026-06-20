import type { FailureClassification } from "../lifecycle/types.js";

export interface AgentDiagnosisInput {
  attemptId: string;
  failure: FailureClassification;
  /** Context the agent needs to reason about, gathered from the live stack. */
  context: {
    blockhashSlot: number | null;
    currentSlot: number;
    tipLamportsUsed: number;
    observedRecentFeeMinLamports: number;
    observedRecentFeeMaxLamports: number;
    priorRetryCountForThisLineage: number;
  };
}

export type AgentAction =
  | "refresh_blockhash_and_retry"
  | "increase_tip_and_retry"
  | "abandon"
  | "wait_and_retry";

export interface AgentDecision {
  attemptId: string;
  action: AgentAction;
  /** The model's full reasoning text, logged verbatim for evidence. */
  reasoning: string;
  /** Structured fields the agent extracted from its own reasoning, for programmatic use. */
  shouldRetry: boolean;
  recommendedTipAdjustment: "increase" | "same" | "decrease";
  confidence: number;
  decidedAt: string;
  model: string;
}
