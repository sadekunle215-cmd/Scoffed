import { getConnection } from "../solana/connection.js";
import { getWallet } from "../solana/wallet.js";

const connection = getConnection();
const wallet = getWallet();
const balance = await connection.getBalance(wallet.publicKey);

console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
console.log(`Balance: ${balance / 1_000_000_000} SOL (${balance} lamports)`);
