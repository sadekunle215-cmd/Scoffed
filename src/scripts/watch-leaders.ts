import { getCurrentLeader } from "../leaders/leader-schedule.js";

console.log("Watching leader for current slot every 2s. Ctrl+C to stop.");

const interval = setInterval(async () => {
  const { slot, leader } = await getCurrentLeader();
  console.log(`slot=${slot} leader=${leader ?? "unknown"}`);
}, 2000);

process.on("SIGINT", () => {
  clearInterval(interval);
  process.exit(0);
});
