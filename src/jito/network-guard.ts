import { env } from "../config/env.js";

/**
 * Guards any script that moves real funds. On mainnet, requires the
 * caller to pass an explicit acknowledgement flag (via CLI arg or env)
 * so a misconfigured NETWORK=mainnet can never silently spend real SOL.
 */
export function assertSafeToSubmit(explicitMainnetAck: boolean): void {
  if (env.NETWORK === "mainnet" && !explicitMainnetAck) {
    throw new Error(
      "NETWORK=mainnet but no explicit mainnet acknowledgement was provided. " +
        "Pass --confirm-mainnet to the script to proceed.",
    );
  }
}

export function isMainnet(): boolean {
  return env.NETWORK === "mainnet";
}
