import { buildJitoBundle } from "../jito/bundle-builder.js";
import { sendBundle, getTransactionSignature } from "../jito/bundle-sender.js";
import { pollBundleStatus } from "../jito/bundle-status.js";
import { simulateTransaction } from "../transactions/simulation.js";
import { LifecycleTracker } from "../lifecycle/lifecycle-tracker.js";
import { classifyFailure } from "../failures/classifier.js";
import { assertSafeToSubmit } from "../jito/network-guard.js";

const count = Number(process.argv[2] ?? "10");
const explicitMainnetAck = process.argv.includes("--confirm-mainnet");
assertSafeToSubmit(explicitMainnetAck);

console.log(`Running ${count} real bundle submissions for lifecycle evidence...\n`);

let landed = 0;
let failed = 0;

for (let i = 1; i <= count; i++) {
  console.log(`--- Submission ${i}/${count} ---`);
  try {
    const { bundle } = await buildJitoBundle();
    const signature = getTransactionSignature(bundle);
    const tracker = new LifecycleTracker({
      tipLamports: bundle.tipLamports,
      blockhashSlot: bundle.blockhashSlot,
    });
    tracker.setSignature(signature);

    const sim = await simulateTransaction(bundle.transactions[0]);
    if (!sim.ok) {
      const failure = classifyFailure({ raw: sim.error ?? "simulation failed" });
      tracker.markFailure(failure);
      await tracker.markStage("submitted");
      tracker.persist();
      console.log(`  Simulation failed (${failure.type}), skipped submission.`);
      failed++;
      continue;
    }

    await tracker.markStage("submitted");
    const { bundleId } = await sendBundle(bundle);
    tracker.setBundleId(bundleId);

    const pollResult = await pollBundleStatus(bundleId);
    if (pollResult.landed) {
      await tracker.markStage("processed");
      await tracker.pollUntilCommitment("finalized", 20_000, 1500);
      console.log(`  Landed at slot ${pollResult.finalStatus?.landedSlot}.`);
      landed++;
    } else {
      const raw = pollResult.timedOut
        ? `Timed out. Observed: ${pollResult.observedStates.join(",")}`
        : `Failed. Final: ${JSON.stringify(pollResult.finalStatus)}`;
      const failure = classifyFailure({ raw });
      tracker.markFailure(failure);
      console.log(`  Did not land. Classified as ${failure.type}.`);
      failed++;
    }
    tracker.persist();
  } catch (err) {
    console.error(`  Submission ${i} threw: ${err instanceof Error ? err.message : err}`);
    failed++;
  }

  // Brief pause between submissions so each gets a fresh blockhash/slot
  // context and we don't hammer the RPC/Block Engine back-to-back.
  await new Promise((r) => setTimeout(r, 3000));
}

console.log(`\nDone. Landed: ${landed}, Failed: ${failed}, Total: ${count}.`);
