import { assertRpcHealthy } from "../solana/connection.js";

const result = await assertRpcHealthy();
if (result.ok) {
  console.log(`RPC healthy. Slot: ${result.slot}, version: ${result.version}`);
} else {
  console.error(`RPC unhealthy: ${result.error}`);
  process.exit(1);
}
