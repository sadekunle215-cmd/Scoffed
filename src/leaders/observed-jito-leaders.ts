import { readJsonl, writeJson, readJson } from "../lifecycle/log-writer.js";
import { getLeaderForSlot } from "./leader-schedule.js";
import type { ObservedJitoLeadersFile } from "./types.js";
import type { LifecycleRecord } from "../lifecycle/types.js";

const LIFECYCLE_LOG_PATH = "data/lifecycle/jito-bundles.jsonl";
const OBSERVED_LEADERS_PATH = "data/lifecycle/observed-jito-leaders.json";

/**
 * Scans the lifecycle log for bundles that actually landed, looks up
 * which validator was leader at the landed slot, and persists that
 * identity as an "observed Jito-compatible leader." This is learned
 * from real evidence rather than a hardcoded validator allowlist —
 * the set grows only as bundles are actually observed to land.
 */
export async function learnObservedJitoLeaders(): Promise<ObservedJitoLeadersFile> {
  const records = readJsonl<LifecycleRecord>(LIFECYCLE_LOG_PATH);
  const landedSlots = records
    .filter((r) => r.stages.some((s) => s.stage === "confirmed" || s.stage === "finalized"))
    .map((r) => r.stages.find((s) => s.stage === "confirmed")?.slot)
    .filter((s): s is number => s !== null && s !== undefined);

  const existing = readJson<ObservedJitoLeadersFile>(OBSERVED_LEADERS_PATH);
  const identities = new Set<string>(existing?.identities ?? []);

  for (const slot of landedSlots) {
    const leader = await getLeaderForSlot(slot);
    if (leader) identities.add(leader);
  }

  const result: ObservedJitoLeadersFile = {
    updatedAt: new Date().toISOString(),
    identities: Array.from(identities),
  };

  writeJson(OBSERVED_LEADERS_PATH, result);
  return result;
}

export function getObservedJitoLeaders(): ObservedJitoLeadersFile {
  return readJson<ObservedJitoLeadersFile>(OBSERVED_LEADERS_PATH) ?? {
    updatedAt: new Date().toISOString(),
    identities: [],
  };
}
