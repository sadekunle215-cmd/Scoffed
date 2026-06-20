import { getWallet } from "../solana/wallet.js";
import { explorerAddressUrl } from "../solana/cluster.js";

const wallet = getWallet();
console.log(`Wallet public key: ${wallet.publicKey.toBase58()}`);
console.log(`Explorer: ${explorerAddressUrl(wallet.publicKey.toBase58())}`);
