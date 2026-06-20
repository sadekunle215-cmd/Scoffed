import { Keypair } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

let walletSingleton: Keypair | null = null;

/**
 * Loads a Solana CLI-style JSON keypair file (array of 64 numbers)
 * from WALLET_KEYPAIR_PATH. Generates and persists a new one if absent,
 * so devnet onboarding never blocks on a missing file.
 */
export function getWallet(): Keypair {
  if (walletSingleton) return walletSingleton;

  const filePath = path.resolve(env.WALLET_KEYPAIR_PATH);

  if (fs.existsSync(filePath)) {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const loaded: Keypair = Keypair.fromSecretKey(Uint8Array.from(raw));
    walletSingleton = loaded;
    return loaded;
  }

  const fresh: Keypair = Keypair.generate();
  fs.writeFileSync(filePath, JSON.stringify(Array.from(fresh.secretKey)));
  console.warn(
    `No wallet found at ${filePath}. Generated a new one. Fund it via 'pnpm airdrop' (devnet only).`,
  );
  walletSingleton = fresh;
  return fresh;
}
