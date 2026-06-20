import { PublicKey } from "@solana/web3.js";
import { getJitoTipAccounts, pickRandomTipAccount } from "./tip-accounts.js";
import { calculateDynamicTip } from "../tips/tip-engine.js";
import { buildSimpleTransferWithTip } from "../transactions/simple-transfer.js";
import type { BuiltBundle } from "./types.js";
import type { DynamicTipResult } from "../tips/types.js";

export interface BuildBundleResult {
  bundle: BuiltBundle;
  tip: DynamicTipResult;
}

/**
 * Builds a single-transaction Jito bundle: fetches live tip accounts,
 * derives a fully dynamic tip from live fee data, then builds and
 * signs the transfer carrying that tip. No tip value or tip account
 * in this path is hardcoded.
 */
export async function buildJitoBundle(): Promise<BuildBundleResult> {
  const tipAccounts = await getJitoTipAccounts();
  const tipAccount = pickRandomTipAccount(tipAccounts);
  const tip = await calculateDynamicTip();

  const built = await buildSimpleTransferWithTip({
    tipAccount: new PublicKey(tipAccount),
    tipLamports: tip.tipLamports,
  });

  return {
    bundle: {
      transactions: [built.transaction],
      tipLamports: tip.tipLamports,
      tipAccount,
      blockhash: built.blockhash,
      blockhashSlot: built.blockhashSlot,
    },
    tip,
  };
}
