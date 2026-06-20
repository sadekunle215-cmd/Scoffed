import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getConnection } from "../solana/connection.js";
import { getWallet } from "../solana/wallet.js";
import { getJitoTipAccounts, pickRandomTipAccount } from "../jito/tip-accounts.js";
import { calculateDynamicTip } from "../tips/tip-engine.js";
import { simulateTransaction } from "../transactions/simulation.js";
import { LifecycleTracker } from "../lifecycle/lifecycle-tracker.js";
import { classifyFailure } from "../failures/classifier.js";

/**
 * Deliberately reproduces a compute_exceeded failure by setting an
 * unrealistically low compute unit limit (300 units) against a
 * transaction that requires more than that to execute, so simulation
 * genuinely fails with a compute-budget error rather than a fabricated one.
 */
const connection = getConnection();
const wallet = getWallet();
const tipAccounts = await getJitoTipAccounts();
const tipAccount = pickRandomTipAccount(tipAccounts);
const tip = await calculateDynamicTip();

const { blockhash } = await connection.getLatestBlockhash("confirmed");
const blockhashSlot = await connection.getSlot("confirmed");

const tracker = new LifecycleTracker({ tipLamports: tip.tipLamports, blockhashSlot });
await tracker.markStage("submitted");

const instructions = [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 300 }), // deliberately too low
  SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: wallet.publicKey,
    lamports: 1_000,
  }),
  SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: new PublicKey(tipAccount),
    lamports: tip.tipLamports,
  }),
];

const message = new TransactionMessage({
  payerKey: wallet.publicKey,
  recentBlockhash: blockhash,
  instructions,
}).compileToV0Message();

const transaction = new VersionedTransaction(message);
transaction.sign([wallet]);

console.log("Simulating with deliberately-low compute unit limit (300 units)...");
const sim = await simulateTransaction(transaction);

const raw = sim.error
  ? sim.error
  : `Simulation unexpectedly succeeded with unitsConsumed=${sim.unitsConsumed} against a 300-unit limit.`;

const failure = classifyFailure({ raw });
tracker.markFailure(failure);
tracker.persist();

console.log(`Fault injection complete. Classified as: ${failure.type}`);
console.log(`Simulation logs:`, sim.logs);
console.log(JSON.stringify(tracker.snapshot(), null, 2));
