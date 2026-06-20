import { PublicKey } from "@solana/web3.js";
import { getConnection } from "../solana/connection.js";
import type { FeeSample } from "./types.js";

/**
 * Samples live recent prioritization fees from the cluster via
 * getRecentPrioritizationFees. This is the live-data input the tip
 * engine derives its tip from — there is no fallback to a static
 * default list; if the RPC call fails, the caller must handle it,
 * because silently substituting hardcoded fees would defeat the
 * "no hardcoded tip values" requirement.
 */
export async function sampleRecentFees(
  accountsOfInterest: PublicKey[] = [],
): Promise<FeeSample[]> {
  const connection = getConnection();
  const result = await connection.getRecentPrioritizationFees(
    accountsOfInterest.length > 0 ? { lockedWritableAccounts: accountsOfInterest } : undefined,
  );

  return result.map((r: { prioritizationFee: number; slot: number }) => ({
    prioritizationFee: r.prioritizationFee,
    slot: r.slot,
  }));
}
