import bs58 from "bs58";
import type { BuiltBundle } from "./types.js";
import { sendJitoBundle } from "./jito-rpc-client.js";

/**
 * Encodes the bundle's transactions to base58 and submits through the
 * Jito Block Engine's sendBundle method. This is the only submission
 * path used in this project — bundles are never sent via plain RPC
 * sendTransaction, per "Submits through Jito Block Engine only."
 */
export async function sendBundle(bundle: BuiltBundle): Promise<{ bundleId: string }> {
  const encoded = bundle.transactions.map((tx) => bs58.encode(tx.serialize()));
  const result = await sendJitoBundle(encoded);
  return { bundleId: result.bundleId };
}

export function getTransactionSignature(bundle: BuiltBundle): string {
  const tx = bundle.transactions[0];
  const sig = tx.signatures[0];
  return bs58.encode(sig);
}
