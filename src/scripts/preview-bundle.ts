import { buildJitoBundle } from "../jito/bundle-builder.js";
import { getTransactionSignature } from "../jito/bundle-sender.js";

const { bundle, tip } = await buildJitoBundle();

console.log("Built bundle (not sent):");
console.log(`  Tip account: ${bundle.tipAccount}`);
console.log(`  Tip lamports: ${bundle.tipLamports}`);
console.log(`  Blockhash: ${bundle.blockhash} (slot ${bundle.blockhashSlot})`);
console.log(`  Signature (would be): ${getTransactionSignature(bundle)}`);
console.log("\nTip derivation:");
console.log(JSON.stringify(tip, null, 2));
