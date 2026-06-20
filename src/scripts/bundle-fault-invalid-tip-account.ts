import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getConnection } from "../solana/connection.js";
import { getWallet } from "../solana/wallet.js";
import { sendBundle, getTransactionSignature } from "../jito/bundle-sender.js";
import { pollBundleStatus } from "../jito/bundle-status.js";
import { LifecycleTracker } from "../lifecycle/lifecycle-tracker.js";
import { classifyFailure } from "../failures/classifier.js";

/**
 * Deliberately reproduces a bundle_failure by tipping a random keypair
 * that is NOT a real Jito tip account. The Block Engine should reject
 * the bundle outright since it doesn't recognize the destination as a
 * valid tip account, giving a genuine bundle_failure classification.
 */
const connection = getConnection();
const wallet = getWallet();
const fakeTipAccount = Keypair.generate().publicKey;

const { blockhash } = await connection.getLatestBlockhash("confirmed");
const blockhashSlot = await connection.getSlot("confirmed");

const tracker = new LifecycleTracker({ tipLamports: 5000, blockhashSlot });
await tracker.markStage("submitted");

const instructions = [
  SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: wallet.publicKey,
    lamports: 1_000,
  }),
  SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: fakeTipAccount,
    lamports: 5000,
  }),
];

const message = new TransactionMessage({
  payerKey: wallet.publicKey,
  recentBlockhash: blockhash,
  instructions,
}).compileToV0Message();

const transaction = new VersionedTransaction(message);
transaction.sign([wallet]);
tracker.setSignature(getTransactionSignature({ transactions: [transaction] } as any));

console.log(`Submitting bundle tipping a non-Jito account (${fakeTipAccount.toBase58()})...`);

let raw: string;
try {
  const { bundleId } = await sendBundle({
    transactions: [transaction],
    tipLamports: 5000,
    tipAccount: fakeTipAccount.toBase58(),
    blockhash,
    blockhashSlot,
  });
  tracker.setBundleId(bundleId);
  const pollResult = await pollBundleStatus(bundleId);
  raw = pollResult.landed
    ? "Bundle unexpectedly landed despite invalid tip account."
    : `Bundle rejected/failed: tip account ${fakeTipAccount.toBase58()} is not a recognized Jito tip account. ` +
      `Observed states: ${pollResult.observedStates.join(",")}`;
} catch (err) {
  raw = `Bundle rejected at submission: ${err instanceof Error ? err.message : String(err)}. ` +
    `Tip account ${fakeTipAccount.toBase58()} is not a valid Jito tip account.`;
}

const failure = classifyFailure({ raw });
tracker.markFailure(failure);
tracker.persist();

console.log(`Fault injection complete. Classified as: ${failure.type}`);
console.log(JSON.stringify(tracker.snapshot(), null, 2));
