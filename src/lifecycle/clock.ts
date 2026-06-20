import { getConnection } from "../solana/connection.js";

export interface ClockSnapshot {
  at: string;
  slot: number;
}

/**
 * Returns the current wall-clock time paired with the current slot,
 * so every lifecycle stage we record carries both a timestamp and a
 * slot number judges can cross-reference on an explorer.
 */
export async function snapshotClock(): Promise<ClockSnapshot> {
  const connection = getConnection();
  const slot = await connection.getSlot("processed");
  return {
    at: new Date().toISOString(),
    slot,
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}
