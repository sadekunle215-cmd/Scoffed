import { readJsonl } from "../lifecycle/log-writer.js";
import { diagnoseFailureAndDecide } from "../agent/llm-agent.js";
import { getConnection } from "../solana/connection.js";
import { sampleRecentFees } from "../tips/recent-fee-sampler.js";
import type { LifecycleRecord } from "../lifecycle/types.js";

const FAILURE_LOG = "data/lifecycle/jito-bundle-failures.jsonl";

const requestedAttemptId = process.argv[2];
const failures = readJsonl<LifecycleRecord>(FAILURE_LOG);

if (failures.length === 0) {
  console.error("No failures recorded yet. Run a fault-injection script first.");
  process.exit(1);
}

const target = requestedAttemptId
  ? failures.find((f) => f.attemptId === requestedAttemptId)
  : failures[failures.length - 1];

if (!target || !target.failure) {
  console.error(`Could not find a classified failure for attemptId=${requestedAttemptId}`);
  process.exit(1);
  throw new Error("unreachable");
}

const confirmedTarget: LifecycleRecord & { failure: NonNullable<LifecycleRecord["failure"]> } =
  target as LifecycleRecord & { failure: NonNullable<LifecycleRecord["failure"]> };

const connection = getConnection();
const currentSlot = await connection.getSlot("confirmed");
const fees = await sampleRecentFees();
const feeValues = fees.map((f) => f.prioritizationFee);

const priorRetryCount = failures.filter(
  (f) =>
    f.retriedFromAttemptId === confirmedTarget.attemptId ||
    f.attemptId === confirmedTarget.retriedFromAttemptId,
).length;

console.log(
  `Diagnosing failure for attemptId=${confirmedTarget.attemptId} (type: ${confirmedTarget.failure.type})...`,
);

const decision = await diagnoseFailureAndDecide({
  attemptId: confirmedTarget.attemptId,
  failure: confirmedTarget.failure,
  context: {
    blockhashSlot: confirmedTarget.blockhashSlot,
    currentSlot,
    tipLamportsUsed: confirmedTarget.tipLamports,
    observedRecentFeeMinLamports: feeValues.length ? Math.min(...feeValues) : 0,
    observedRecentFeeMaxLamports: feeValues.length ? Math.max(...feeValues) : 0,
    priorRetryCountForThisLineage: priorRetryCount,
  },
});

console.log("\nAgent decision:");
console.log(JSON.stringify(decision, null, 2));
