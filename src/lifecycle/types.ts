export type LifecycleStage =
  | "submitted"
  | "processed"
  | "confirmed"
  | "finalized"
  | "failed";

export interface StageTimestamp {
  stage: LifecycleStage;
  /** ISO-8601 wall-clock timestamp. */
  at: string;
  /** Slot observed at the time this stage was recorded, if known. */
  slot: number | null;
}

export interface LifecycleRecord {
  /** Unique id for this submission attempt (uuid). */
  attemptId: string;
  /** Transaction signature, once known. */
  signature: string | null;
  /** Jito bundle id, once known. */
  bundleId: string | null;
  /** Lamports tipped for this attempt. */
  tipLamports: number;
  /** Slot the transaction's blockhash was fetched at. */
  blockhashSlot: number | null;
  stages: StageTimestamp[];
  /** Populated only if this attempt ultimately failed. */
  failure: FailureClassification | null;
  /** True if this attempt is itself a retry of a previous attemptId. */
  isRetry: boolean;
  retriedFromAttemptId: string | null;
}

export type FailureType =
  | "expired_blockhash"
  | "fee_too_low"
  | "compute_exceeded"
  | "bundle_failure"
  | "unknown";

export interface FailureClassification {
  type: FailureType;
  message: string;
  /** Raw error / log excerpt that led to this classification. */
  rawEvidence: string;
  classifiedAt: string;
}

export interface LatencyDeltas {
  submittedToProcessedMs: number | null;
  submittedToConfirmedMs: number | null;
  submittedToFinalizedMs: number | null;
  processedToConfirmedMs: number | null;
}

export function computeLatencyDeltas(record: LifecycleRecord): LatencyDeltas {
  const find = (stage: LifecycleStage) =>
    record.stages.find((s) => s.stage === stage)?.at ?? null;

  const submitted = find("submitted");
  const processed = find("processed");
  const confirmed = find("confirmed");
  const finalized = find("finalized");

  const delta = (a: string | null, b: string | null) =>
    a && b ? new Date(b).getTime() - new Date(a).getTime() : null;

  return {
    submittedToProcessedMs: delta(submitted, processed),
    submittedToConfirmedMs: delta(submitted, confirmed),
    submittedToFinalizedMs: delta(submitted, finalized),
    processedToConfirmedMs: delta(processed, confirmed),
  };
}
