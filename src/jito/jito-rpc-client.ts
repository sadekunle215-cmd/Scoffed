import { env } from "../config/env.js";
import type { JitoBundleResult, JitoBundleStatus, JitoBundleStatusState } from "./types.js";

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

async function callJitoRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(`${env.JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  const body = (await response.json()) as JsonRpcResponse<T>;

  if (!response.ok || body.error) {
    throw new Error(
      `Jito RPC ${method} failed: ${body.error?.message ?? response.statusText}`,
    );
  }
  if (body.result === undefined) {
    throw new Error(`Jito RPC ${method} returned no result.`);
  }
  return body.result;
}

/** Submits a bundle of base58-encoded, already-signed transactions through the Jito Block Engine. */
export async function sendJitoBundle(encodedTransactions: string[]): Promise<JitoBundleResult> {
  const bundleId = await callJitoRpc<string>("sendBundle", [encodedTransactions]);
  return { bundleId };
}

/**
 * Queries bundle status. Per observed behavior, an early "Invalid" or
 * "Pending" read is not necessarily terminal — callers should keep
 * polling rather than treat the first non-Landed read as final.
 */
export async function getJitoBundleStatuses(bundleIds: string[]): Promise<JitoBundleStatus[]> {
  type RawStatusValue = {
    bundle_id: string;
    status: JitoBundleStatusState;
    landed_slot: number | null;
    transactions: string[] | null;
  };
  type RawResult = { value: RawStatusValue[] };

  const result = await callJitoRpc<RawResult>("getBundleStatuses", [bundleIds]);

  return result.value.map((v) => ({
    bundleId: v.bundle_id,
    status: v.status,
    landedSlot: v.landed_slot,
    transactions: v.transactions,
    raw: v,
  }));
}
