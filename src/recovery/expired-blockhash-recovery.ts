import { PublicKey } from "@solana/web3.js";
import { getJitoTipAccounts, pickRandomTipAccount } from "../jito/tip-accounts.js";
import { calculateDynamicTip } from "../tips/tip-engine.js";
import { buildSimpleTransferWithTip } from "../transactions/simple-transfer.js";
import type { RecoveryAttempt } from "./types.js";
import type { BuiltBundle } from "../jito/types.js";

/**
 * Performs the mechanical recovery steps for an expired-blockhash
 * failure: fetch a fresh blockhash, recalculate the tip from live data,
 * and rebuild a signed transaction. This module does NOT decide
 * *whether* to retry — that decision belongs to the AI agent
 * (src/agent/llm-agent.ts). This keeps the "AI reasons, recovery
 * executes" separation explicit, per "clean separation between AI
 * layer and core transaction stack."
 */
export async function recoverFromExpiredBlockhash(opts: {
  originalAttemptId: string;
  newAttemptId: string;
  reason: string;
}): Promise<{ bundle: BuiltBundle; recovery: RecoveryAttempt }> {
  const tipAccounts = await getJitoTipAccounts();
  const tipAccount = pickRandomTipAccount(tipAccounts);
  const tip = await calculateDynamicTip();

  const built = await buildSimpleTransferWithTip({
    tipAccount: new PublicKey(tipAccount),
    tipLamports: tip.tipLamports,
  });

  const recovery: RecoveryAttempt = {
    originalAttemptId: opts.originalAttemptId,
    newAttemptId: opts.newAttemptId,
    reason: opts.reason,
    newBlockhash: built.blockhash,
    newBlockhashSlot: built.blockhashSlot,
    newTipLamports: tip.tipLamports,
    recoveredAt: new Date().toISOString(),
  };

  return {
    bundle: {
      transactions: [built.transaction],
      tipLamports: tip.tipLamports,
      tipAccount,
      blockhash: built.blockhash,
      blockhashSlot: built.blockhashSlot,
    },
    recovery,
  };
}
