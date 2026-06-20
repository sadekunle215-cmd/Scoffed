import type { VersionedTransaction } from "@solana/web3.js";

export interface JitoBundleResult {
  bundleId: string;
}

export type JitoBundleStatusState =
  | "Invalid"
  | "Pending"
  | "Failed"
  | "Landed";

export interface JitoBundleStatus {
  bundleId: string;
  status: JitoBundleStatusState;
  landedSlot: number | null;
  transactions: string[] | null;
  raw: unknown;
}

export interface BuiltBundle {
  transactions: VersionedTransaction[];
  tipLamports: number;
  tipAccount: string;
  blockhash: string;
  blockhashSlot: number;
}
