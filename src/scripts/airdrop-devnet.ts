import { getConnection } from "../solana/connection.js";
import { getWallet } from "../solana/wallet.js";
import { env } from "../config/env.js";

if (env.NETWORK !== "devnet") {
  console.error("Refusing to airdrop: NETWORK is not devnet.");
  process.exit(1);
}

const connection = getConnection();
const wallet = getWallet();

console.log(`Requesting 2 SOL airdrop for ${wallet.publicKey.toBase58()}...`);
const signature = await connection.requestAirdrop(wallet.publicKey, 2_000_000_000);
await connection.confirmTransaction(signature, "confirmed");
console.log(`Airdrop confirmed: ${signature}`);

const balance = await connection.getBalance(wallet.publicKey);
console.log(`New balance: ${balance / 1_000_000_000} SOL`);
