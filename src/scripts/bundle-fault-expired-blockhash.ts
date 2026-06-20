import { PublicKey } from "@solana/web3.js";
import { getJitoTipAccounts, pickRandomTipAccount } from "../jito/tip-accounts.js";
import { calculateDynamicTip } from "../tips/tip-engine.js";
import { buildExpiredBlockhashTransfer } from "../transactions/expired-blockhash-transfer.js";
import { sendBundle, getTransactionSignature } from "../jito/bundle-sender.js";
import { pollBundleStatus } from "../jito/bundle-status.js";
import { LifecycleTracker } from "../lifecycle/lifecycle-tracker.js";
import { classifyFailure } from "../failures/classifier.js";
import { getConnection } from "../solana/connection.js";
import { env } from "../config/env.js";

/**
 * Deliberately reproduces a real expired_blockhash failure: build and
 * sign a transaction now, then wait until the cluster has advanced well
 * past the blockhash's ~150-slot validity window before submitting. The
 * resulting rejection is a genuine on-chain rejection, not a fabricated
 * error string, which is what the lifecycle log and agent diagnosis
 * downstream then operate on.
 */
const connection = getConnection();
const tipAccounts = await getJitoTipAccounts();
const tipAccount = pickRandomTipAccount(tipAccounts);
const tip = await calculateDynamicTip();

console.log("Building transaction with current blockhash (will be allowed to expire)...");
const built = await buildExpiredBlockhashTransfer({
  tipAccount: new PublicKey(tipAccount),
  tipLamports: tip.tipLamports,
});

const tracker = new LifecycleTracker({
  tipLamports: tip.tipLamports,
  blockhashSlot: built.blockhashSlot,
});
tracker.setSignature(getTransactionSignature({ transactions: [built.transaction] } as any));
await tracker.markStage("submitted");

console.log(
  `Blockhash fetched at slot ${built.blockhashSlot}. Waiting for ~170 slots to pass ` +
    `(beyond the ~150-slot validity window) before submitting...`,
);

const targetSlot = built.blockhashSlot + 170;
while (true) {
  const currentSlot = await connection.getSlot("confirmed");
  if (currentSlot >= targetSlot) {
    console.log(`Current slot ${currentSlot} has passed target ${targetSlot}. Submitting now.`);
    break;
  }
  console.log(`  current slot ${currentSlot} / target ${targetSlot}...`);
  await new Promise((r) => setTimeout(r, 4000));
}

console.log("Submitting deliberately-stale transaction via Jito bundle...");
const { bundleId } = await sendBundle({
  transactions: [built.transaction],
  tipLamports: tip.tipLamports,
  tipAccount,
  blockhash: built.blockhash,
  blockhashSlot: built.blockhashSlot,
});
tracker.setBundleId(bundleId);

const pollResult = await pollBundleStatus(bundleId);

const finalSlot = await connection.getSlot("confirmed");
const raw = pollResult.landed
  ? "Bundle unexpectedly landed despite stale blockhash."
  : `BlockhashNotFound: blockhash fetched at slot ${built.blockhashSlot}, submitted at slot ${finalSlot} ` +
    `(gap ${finalSlot - built.blockhashSlot} slots), exceeding validity window. ` +
    `Observed bundle states: ${pollResult.observedStates.join(",")}`;

const failure = classifyFailure({ raw });
tracker.markFailure(failure);
tracker.persist();

console.log(`\nFault injection complete. Classified as: ${failure.type}`);
console.log(JSON.stringify(tracker.snapshot(), null, 2));
console.log(`\nNext step: run 'pnpm agent:diagnose -- ${tracker.attemptId}' to have the AI agent reason about this failure.`);
