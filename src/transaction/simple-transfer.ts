import {
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { getConnection } from "../solana/connection.js";
import { getWallet } from "../solana/wallet.js";
import { env } from "../config/env.js";

export interface TransferBuildResult {
  transaction: VersionedTransaction;
  blockhash: string;
  blockhashSlot: number;
}

/**
 * Builds a signed, versioned SOL transfer transaction with a priority
 * fee and compute unit limit attached, paying the Jito tip to the
 * provided tip account as a second instruction in the same transaction.
 */
export async function buildSimpleTransferWithTip(opts: {
  toPubkey?: PublicKey;
  lamports?: number;
  tipAccount: PublicKey;
  tipLamports: number;
}): Promise<TransferBuildResult> {
  const connection = getConnection();
  const wallet = getWallet();
  const destination = opts.toPubkey ?? wallet.publicKey; // self-transfer by default, safe for evidence runs

  const { blockhash, lastValidBlockHeight: _lastValid } =
    await connection.getLatestBlockhash("confirmed");
  const blockhashSlot = await connection.getSlot("confirmed");

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: env.COMPUTE_UNIT_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: env.PRIORITY_FEE_MICRO_LAMPORTS,
    }),
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: destination,
      lamports: opts.lamports ?? 1_000, // trivial amount; this is an infra evidence run, not a payment
    }),
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: opts.tipAccount,
      lamports: opts.tipLamports,
    }),
  ];

  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  transaction.sign([wallet]);

  return { transaction, blockhash, blockhashSlot };
}
