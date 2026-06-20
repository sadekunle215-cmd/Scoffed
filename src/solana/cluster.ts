import { env } from "../config/env.js";

export type ClusterName = "devnet" | "mainnet";

export function currentCluster(): ClusterName {
  return env.NETWORK;
}

export function explorerTxUrl(signature: string): string {
  const cluster = currentCluster();
  const suffix = cluster === "mainnet" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
}

export function explorerSlotUrl(slot: number): string {
  const cluster = currentCluster();
  const suffix = cluster === "mainnet" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/block/${slot}${suffix}`;
}

export function explorerAddressUrl(address: string): string {
  const cluster = currentCluster();
  const suffix = cluster === "mainnet" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/address/${address}${suffix}`;
}
