import { env } from "../config/env.js";
import { getJitoBundleStatuses } from "./jito-rpc-client.js";
import type { JitoBundleStatus } from "./types.js";

export interface BundlePollResult {
  finalStatus: JitoBundleStatus | null;
  landed: boolean;
  timedOut: boolean;
  observedStates: JitoBundleStatus["status"][];
}

/**
 * Polls Jito bundle status until it reaches a terminal state (Landed or
 * Failed) or the timeout elapses. Deliberately does NOT treat an early
 * "Invalid" or "Pending" read as terminal — bundle status can and does
 * move from Invalid/Pending to Landed as the bundle propagates, so
 * stopping on the first non-Landed read would produce false-negative
 * failure evidence.
 */
export async function pollBundleStatus(bundleId: string): Promise<BundlePollResult> {
  const deadline = Date.now() + env.BUNDLE_STATUS_TIMEOUT_MS;
  const observedStates: JitoBundleStatus["status"][] = [];

  while (Date.now() < deadline) {
    let statuses: JitoBundleStatus[] = [];
    try {
      statuses = await getJitoBundleStatuses([bundleId]);
    } catch {
      // Transient RPC hiccup; keep polling rather than failing immediately.
    }

    const status = statuses[0];
    if (status) {
      observedStates.push(status.status);
      if (status.status === "Landed") {
        return { finalStatus: status, landed: true, timedOut: false, observedStates };
      }
      if (status.status === "Failed") {
        return { finalStatus: status, landed: false, timedOut: false, observedStates };
      }
    }

    await new Promise((r) => setTimeout(r, env.BUNDLE_STATUS_POLL_INTERVAL_MS));
  }

  return { finalStatus: null, landed: false, timedOut: true, observedStates };
}
