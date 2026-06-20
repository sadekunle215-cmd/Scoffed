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

export interface ExpiredBlockhashBuildResult {
  transaction: VersionedTransaction;
  blockhash: string;
  blockhashSlot: number;
}

/**
 * Builds a signed transaction using a deliberately stale blockhash —
 * fetched once, then we wait past its validity window before signing
 * and submitting — to deterministically reproduce an expired_blockhash
 * failure for the required fault-injection demonstration. This is a
 * real on-chain rejection, not a simulated/faked error string.
 */
export async function buildExpiredBlockhashTransfer(opts: {
  tipAccount: PublicKey;
  tipLamports: number;
}): Promise<ExpiredBlockhashBuildResult> {
  const connection = getConnection();
  const wallet = getWallet();

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const blockhashSlot = await connection.getSlot("confirmed");

  // Deliberately let this blockhash age past its ~150-slot validity
  // window before it's used. Callers are expected to wait/poll slot
  // advancement themselves; this function just records what blockhash
  // and slot the stale transaction was built against, for evidence.
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: env.COMPUTE_UNIT_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: env.PRIORITY_FEE_MICRO_LAMPORTS,
    }),
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: wallet.publicKey,
      lamports: 1_000,
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
