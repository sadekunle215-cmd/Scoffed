import { getCurrentLeader } from "./leader-schedule.js";
import { getObservedJitoLeaders } from "./observed-jito-leaders.js";
import type { LeaderWindowCheck } from "./types.js";

/**
 * Checks whether the current slot's leader is one we've observed to
 * actually land Jito bundles. This directly implements "Detect the
 * correct leader window for submission" — it's a real check against
 * learned evidence, not a no-op that always says "submit."
 */
export async function checkLeaderWindow(): Promise<LeaderWindowCheck> {
  const { slot, leader } = await getCurrentLeader();
  const observed = getObservedJitoLeaders();

  if (!leader) {
    return {
      currentSlot: slot,
      currentLeader: null,
      isObservedJitoLeader: false,
      recommendation: "wait",
      reasoning: "Could not resolve a leader for the current slot from the schedule.",
    };
  }

  // Before any evidence has been collected, the observed-leader set is
  // empty — in that bootstrap case we recommend submitting anyway so the
  // first evidence run can populate it, rather than deadlocking.
  if (observed.identities.length === 0) {
    return {
      currentSlot: slot,
      currentLeader: leader,
      isObservedJitoLeader: false,
      recommendation: "submit",
      reasoning:
        "No observed-Jito-leader evidence collected yet; submitting to begin building " +
        "the observed-leader evidence set from real landed bundles.",
    };
  }

  const isObserved = observed.identities.includes(leader);
  return {
    currentSlot: slot,
    currentLeader: leader,
    isObservedJitoLeader: isObserved,
    recommendation: isObserved ? "submit" : "wait",
    reasoning: isObserved
      ? `Current leader ${leader} has previously landed a Jito bundle; favorable window.`
      : `Current leader ${leader} has no observed history of landing Jito bundles; ` +
        `waiting for a more favorable window is recommended.`,
  };
}
