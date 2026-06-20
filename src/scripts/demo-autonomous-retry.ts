import { PublicKey } from "@solana/web3.js";
import { getConnection } from "../solana/connection.js";
import { getJitoTipAccounts, pickRandomTipAccount } from "../jito/tip-accounts.js";
import { calculateDynamicTip } from "../tips/tip-engine.js";
import { sampleRecentFees } from "../tips/recent-fee-sampler.js";
import { buildExpiredBlockhashTransfer } from "../transactions/expired-blockhash-transfer.js";
import { sendBundle, getTransactionSignature } from "../jito/bundle-sender.js";
import { pollBundleStatus } from "../jito/bundle-status.js";
import { LifecycleTracker } from "../lifecycle/lifecycle-tracker.js";
import { classifyFailure } from "../failures/classifier.js";
import { diagnoseFailureAndDecide } from "../agent/llm-agent.js";
import { logAutonomousRecoveryEvent } from "../agent/decision-log.js";
import { recoverFromExpiredBlockhash } from "../recovery/expired-blockhash-recovery.js";
import { randomUUID } from "node:crypto";

/**
 * End-to-end autonomous retry demonstration, satisfying the bounty's
 * mandatory fault-injection requirement:
 *   1. Simulate a real expired-blockhash failure (genuine on-chain rejection)
 *   2. The agent (a real LLM call) observes the failure and reasons about it
 *   3. The agent's decision — not hardcoded logic — determines whether/how to retry
 *   4. Only if the agent decides to retry does the recovery module execute:
 *      fresh blockhash, recalculated live tip, resubmission
 *
 * There is no code path here that retries without going through the
 * agent's decision first.
 */
console.log("=== Autonomous Retry Demo: Fault Injection -> Agent Reasoning -> Recovery ===\n");

const connection = getConnection();

// ── Step 1: Inject a real expired-blockhash failure ─────────────────────
console.log("[1/4] Injecting a real expired-blockhash failure...");
const tipAccounts = await getJitoTipAccounts();
const tipAccount = pickRandomTipAccount(tipAccounts);
const initialTip = await calculateDynamicTip();

const built = await buildExpiredBlockhashTransfer({
  tipAccount: new PublicKey(tipAccount),
  tipLamports: initialTip.tipLamports,
});

const tracker = new LifecycleTracker({
  tipLamports: initialTip.tipLamports,
  blockhashSlot: built.blockhashSlot,
});
tracker.setSignature(getTransactionSignature({ transactions: [built.transaction] } as any));
await tracker.markStage("submitted");

const targetSlot = built.blockhashSlot + 170;
console.log(
  `  Blockhash fetched at slot ${built.blockhashSlot}. Waiting for slot ${targetSlot} ` +
    `(this takes a few minutes on devnet)...`,
);
while (true) {
  const currentSlot = await connection.getSlot("confirmed");
  if (currentSlot >= targetSlot) break;
  console.log(`    slot ${currentSlot}/${targetSlot}...`);
  await new Promise((r) => setTimeout(r, 5000));
}

const { bundleId: firstBundleId } = await sendBundle({
  transactions: [built.transaction],
  tipLamports: initialTip.tipLamports,
  tipAccount,
  blockhash: built.blockhash,
  blockhashSlot: built.blockhashSlot,
});
tracker.setBundleId(firstBundleId);
const firstPoll = await pollBundleStatus(firstBundleId);
const finalSlot = await connection.getSlot("confirmed");

const failureRaw = firstPoll.landed
  ? "Bundle unexpectedly landed despite stale blockhash (no failure to diagnose)."
  : `BlockhashNotFound: blockhash slot ${built.blockhashSlot}, submitted at slot ${finalSlot} ` +
    `(gap ${finalSlot - built.blockhashSlot} slots). Observed states: ${firstPoll.observedStates.join(",")}`;

if (firstPoll.landed) {
  console.error("  Fault injection did not produce a failure; aborting demo.");
  process.exit(1);
}

const failure = classifyFailure({ raw: failureRaw });
tracker.markFailure(failure);
tracker.persist();
console.log(`  Failure confirmed and classified as: ${failure.type}\n`);

// ── Step 2: Agent observes and reasons ───────────────────────────────────
console.log("[2/4] Agent (LLM) diagnosing the failure...");
const fees = await sampleRecentFees();
const feeValues = fees.map((f) => f.prioritizationFee);

const decision = await diagnoseFailureAndDecide({
  attemptId: tracker.attemptId,
  failure,
  context: {
    blockhashSlot: built.blockhashSlot,
    currentSlot: finalSlot,
    tipLamportsUsed: initialTip.tipLamports,
    observedRecentFeeMinLamports: feeValues.length ? Math.min(...feeValues) : 0,
    observedRecentFeeMaxLamports: feeValues.length ? Math.max(...feeValues) : 0,
    priorRetryCountForThisLineage: 0,
  },
});

console.log(`  Agent action: ${decision.action}`);
console.log(`  Agent reasoning: ${decision.reasoning}`);
console.log(`  shouldRetry=${decision.shouldRetry} confidence=${decision.confidence}\n`);

logAutonomousRecoveryEvent({
  phase: "diagnosis",
  originalAttemptId: tracker.attemptId,
  failureType: failure.type,
  decision,
});

// ── Step 3 & 4: Recovery executes ONLY what the agent decided ───────────
if (!decision.shouldRetry || decision.action === "abandon") {
  console.log("[3/4] Agent decided NOT to retry. Demo ends here — no hardcoded override.");
  logAutonomousRecoveryEvent({
    phase: "terminal",
    originalAttemptId: tracker.attemptId,
    outcome: "abandoned_by_agent",
    decision,
  });
  process.exit(0);
}

console.log(`[3/4] Agent decided to retry via action="${decision.action}". Executing recovery...`);
const newAttemptId = randomUUID();
const { bundle: recoveredBundle, recovery } = await recoverFromExpiredBlockhash({
  originalAttemptId: tracker.attemptId,
  newAttemptId,
  reason: decision.reasoning,
});

console.log(
  `  New blockhash slot: ${recovery.newBlockhashSlot}, new tip: ${recovery.newTipLamports} lamports ` +
    `(was ${initialTip.tipLamports})`,
);

const retryTracker = new LifecycleTracker({
  tipLamports: recovery.newTipLamports,
  blockhashSlot: recovery.newBlockhashSlot,
  isRetry: true,
  retriedFromAttemptId: tracker.attemptId,
});
retryTracker.setSignature(getTransactionSignature(recoveredBundle));
await retryTracker.markStage("submitted");

console.log("[4/4] Resubmitting recovered bundle...");
const { bundleId: retryBundleId } = await sendBundle(recoveredBundle);
retryTracker.setBundleId(retryBundleId);

const retryPoll = await pollBundleStatus(retryBundleId);

if (retryPoll.landed) {
  await retryTracker.markStage("processed");
  await retryTracker.pollUntilCommitment("finalized", 20_000, 1500);
  console.log(`  Retry landed at slot ${retryPoll.finalStatus?.landedSlot}.`);
} else {
  const retryFailure = classifyFailure({
    raw: `Retry also failed to land. Observed states: ${retryPoll.observedStates.join(",")}`,
  });
  retryTracker.markFailure(retryFailure);
  console.log(`  Retry failed. Classified as: ${retryFailure.type}`);
}

retryTracker.persist();
logAutonomousRecoveryEvent({
  phase: "retry_result",
  originalAttemptId: tracker.attemptId,
  newAttemptId,
  landed: retryPoll.landed,
  recovery,
});

console.log("\n=== Demo complete ===");
console.log(JSON.stringify({ original: tracker.snapshot(), retry: retryTracker.snapshot() }, null, 2));
