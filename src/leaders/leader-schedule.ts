import { getConnection } from "../solana/connection.js";

interface CachedSchedule {
  epoch: number;
  /** Map of leader identity -> array of relative slot indices within the epoch. */
  schedule: Record<string, number[]>;
  firstSlotOfEpoch: number;
}

let cache: CachedSchedule | null = null;

async function loadScheduleForCurrentEpoch(): Promise<CachedSchedule> {
  const connection = getConnection();
  const epochInfo = await connection.getEpochInfo();
  const schedule = await connection.getLeaderSchedule();

  if (!schedule) {
    throw new Error("RPC returned no leader schedule.");
  }

  const firstSlotOfEpoch = epochInfo.absoluteSlot - epochInfo.slotIndex;

  return {
    epoch: epochInfo.epoch,
    schedule,
    firstSlotOfEpoch,
  };
}

async function getCachedSchedule(): Promise<CachedSchedule> {
  const connection = getConnection();
  const epochInfo = await connection.getEpochInfo();
  if (!cache || cache.epoch !== epochInfo.epoch) {
    cache = await loadScheduleForCurrentEpoch();
  }
  return cache;
}

/** Returns the validator identity scheduled to lead the given absolute slot. */
export async function getLeaderForSlot(absoluteSlot: number): Promise<string | null> {
  const { schedule, firstSlotOfEpoch } = await getCachedSchedule();
  const relativeSlot = absoluteSlot - firstSlotOfEpoch;

  for (const [identity, slots] of Object.entries(schedule)) {
    if (slots.includes(relativeSlot)) {
      return identity;
    }
  }
  return null;
}

/** Returns the leader identity for the current slot, per the connection's current commitment view. */
export async function getCurrentLeader(): Promise<{ slot: number; leader: string | null }> {
  const connection = getConnection();
  const slot = await connection.getSlot("processed");
  const leader = await getLeaderForSlot(slot);
  return { slot, leader };
}
