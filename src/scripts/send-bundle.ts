import { buildJitoBundle } from "../jito/bundle-builder.js";
import { sendBundle, getTransactionSignature } from "../jito/bundle-sender.js";
import { pollBundleStatus } from "../jito/bundle-status.js";
import { simulateTransaction } from "../transactions/simulation.js";
import { LifecycleTracker } from "../lifecycle/lifecycle-tracker.js";
import { classifyFailure } from "../failures/classifier.js";
import { assertSafeToSubmit } from "../jito/network-guard.js";
import { explorerTxUrl, explorerSlotUrl } from "../solana/cluster.js";
import { env } from "../config/env.js";

const explicitMainnetAck = process.argv.includes("--confirm-mainnet");
assertSafeToSubmit(explicitMainnetAck);

console.log(`Building bundle on ${env.NETWORK}...`);
const { bundle, tip } = await buildJitoBundle();
const signature = getTransactionSignature(bundle);

const tracker = new LifecycleTracker({
  tipLamports: bundle.tipLamports,
  blockhashSlot: bundle.blockhashSlot,
});
tracker.setSignature(signature);

console.log(`Simulating before submission...`);
const sim = await simulateTransaction(bundle.transactions[0]);
if (!sim.ok) {
  const failure = classifyFailure({ raw: sim.error ?? "simulation failed with no error message" });
  tracker.markFailure(failure);
  await tracker.markStage("submitted");
  tracker.persist();
  console.error(`Simulation failed, not submitting. Classified as: ${failure.type}`);
  console.error(sim.error);
  process.exit(1);
}
console.log(`Simulation OK. Units consumed: ${sim.unitsConsumed}`);

await tracker.markStage("submitted");
console.log(`Submitting bundle to Jito (tip: ${bundle.tipLamports} lamports)...`);
const { bundleId } = await sendBundle(bundle);
tracker.setBundleId(bundleId);
console.log(`Bundle submitted. bundleId=${bundleId} signature=${signature}`);
console.log(`Explorer (once landed): ${explorerTxUrl(signature)}`);

console.log(`Polling bundle status (primary landing confirmation, not plain RPC polling)...`);
const pollResult = await pollBundleStatus(bundleId);
console.log(`Observed bundle states: ${pollResult.observedStates.join(" -> ") || "(none)"}`);

if (pollResult.landed) {
  await tracker.markStage("processed");
  // Cross-check final commitment via RPC signature status as a secondary
  // confirmation layer, per "track lifecycle across commitment levels."
  await tracker.pollUntilCommitment("finalized", 20_000, 1500);
  console.log(`Bundle landed at slot ${pollResult.finalStatus?.landedSlot}.`);
  console.log(`Explorer: ${explorerSlotUrl(pollResult.finalStatus?.landedSlot ?? 0)}`);
} else {
  const raw = pollResult.timedOut
    ? `Bundle status polling timed out after ${env.BUNDLE_STATUS_TIMEOUT_MS}ms. Observed states: ${pollResult.observedStates.join(",")}`
    : `Bundle failed. Final status: ${JSON.stringify(pollResult.finalStatus)}`;
  const failure = classifyFailure({ raw });
  tracker.markFailure(failure);
  console.error(`Bundle did not land. Classified as: ${failure.type}`);
}

tracker.persist();
console.log(`\nLifecycle record:`);
console.log(JSON.stringify(tracker.snapshot(), null, 2));
