import { randomUUID } from "node:crypto";
import { getConnection } from "../solana/connection.js";
import { snapshotClock } from "./clock.js";
import { appendJsonl } from "./log-writer.js";
import type {
  FailureClassification,
  LifecycleRecord,
  LifecycleStage,
  StageTimestamp,
} from "./types.js";

const LIFECYCLE_LOG_PATH = "data/lifecycle/jito-bundles.jsonl";
const FAILURE_LOG_PATH = "data/lifecycle/jito-bundle-failures.jsonl";

export class LifecycleTracker {
  private record: LifecycleRecord;

  constructor(opts: {
    tipLamports: number;
    blockhashSlot: number | null;
    isRetry?: boolean;
    retriedFromAttemptId?: string | null;
  }) {
    this.record = {
      attemptId: randomUUID(),
      signature: null,
      bundleId: null,
      tipLamports: opts.tipLamports,
      blockhashSlot: opts.blockhashSlot,
      stages: [],
      failure: null,
      isRetry: opts.isRetry ?? false,
      retriedFromAttemptId: opts.retriedFromAttemptId ?? null,
    };
  }

  get attemptId(): string {
    return this.record.attemptId;
  }

  setSignature(signature: string): void {
    this.record.signature = signature;
  }

  setBundleId(bundleId: string): void {
    this.record.bundleId = bundleId;
  }

  /** Records a lifecycle stage transition with the current wall-clock time and slot. */
  async markStage(stage: LifecycleStage): Promise<StageTimestamp> {
    const snapshot = await snapshotClock();
    const entry: StageTimestamp = {
      stage,
      at: snapshot.at,
      slot: snapshot.slot,
    };
    this.record.stages.push(entry);
    return entry;
  }

  markFailure(failure: FailureClassification): void {
    this.record.failure = failure;
  }

  snapshot(): LifecycleRecord {
    return structuredClone(this.record);
  }

  /** Persists this attempt to the appropriate evidence log (success vs failure stream). */
  persist(): void {
    const target = this.record.failure ? FAILURE_LOG_PATH : LIFECYCLE_LOG_PATH;
    appendJsonl(target, this.record);
  }

  /**
   * Polls confirmation status via getSignatureStatuses until the signature
   * reaches the target commitment or the timeout elapses. This is used as
   * a fallback / cross-check; primary landing confirmation for bundles
   * comes from the stream subscription + bundle status poller, per the
   * "RPC polling alone is not sufficient" requirement.
   */
  async pollUntilCommitment(
    targetCommitment: "confirmed" | "finalized",
    timeoutMs: number,
    pollIntervalMs: number,
  ): Promise<boolean> {
    if (!this.record.signature) return false;
    const connection = getConnection();
    const deadline = Date.now() + timeoutMs;
    const seen = new Set<LifecycleStage>(this.record.stages.map((s) => s.stage));

    while (Date.now() < deadline) {
      const { value } = await connection.getSignatureStatuses([this.record.signature]);
      const status = value[0];

      if (status?.err) {
        return false;
      }

      if (status?.confirmationStatus === "processed" && !seen.has("processed")) {
        await this.markStage("processed");
        seen.add("processed");
      }
      if (status?.confirmationStatus === "confirmed" && !seen.has("confirmed")) {
        await this.markStage("confirmed");
        seen.add("confirmed");
        if (targetCommitment === "confirmed") return true;
      }
      if (status?.confirmationStatus === "finalized" && !seen.has("finalized")) {
        await this.markStage("finalized");
        seen.add("finalized");
        return true;
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    return false;
  }
}
