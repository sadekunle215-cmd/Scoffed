import { getJitoTipAccounts } from "../jito/tip-accounts.js";

try {
  const accounts = await getJitoTipAccounts();
  console.log(`Jito Block Engine reachable. ${accounts.length} live tip accounts:`);
  for (const a of accounts) console.log(`  - ${a}`);
} catch (err) {
  console.error(`Jito Block Engine unreachable: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
