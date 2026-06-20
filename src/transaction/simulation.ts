import type { VersionedTransaction } from "@solana/web3.js";
import { getConnection } from "../solana/connection.js";

export interface SimulationOutcome {
  ok: boolean;
  unitsConsumed: number | null;
  logs: string[] | null;
  error: string | null;
}

/**
 * Simulates a signed transaction before submitting it through Jito.
 * This is the pre-flight check required by the bounty ("Simulates
 * signed transactions before bundle submission"). A failed simulation
 * for the compute-exceeded fault case is captured here and is NOT
 * submitted to Jito unless explicitly forced for fault-injection
 * evidence purposes.
 */
export async function simulateTransaction(
  transaction: VersionedTransaction,
): Promise<SimulationOutcome> {
  const connection = getConnection();
  try {
    const result = await connection.simulateTransaction(transaction, {
      sigVerify: false,
      replaceRecentBlockhash: false,
    });

    if (result.value.err) {
      return {
        ok: false,
        unitsConsumed: result.value.unitsConsumed ?? null,
        logs: result.value.logs ?? null,
        error: JSON.stringify(result.value.err),
      };
    }

    return {
      ok: true,
      unitsConsumed: result.value.unitsConsumed ?? null,
      logs: result.value.logs ?? null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      unitsConsumed: null,
      logs: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
