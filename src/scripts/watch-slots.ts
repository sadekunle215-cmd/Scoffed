import { createSlotStream } from "../streaming/create-slot-stream.js";
import { env } from "../config/env.js";

console.log(`Watching slots via ${env.SLOT_STREAM_SOURCE}. Ctrl+C to stop.`);
const stream = createSlotStream();

await stream.start((event) => {
  console.log(
    `[${event.source}] slot=${event.slot} parent=${event.parent} status=${event.status} at=${event.receivedAt}`,
  );
});

process.on("SIGINT", async () => {
  await stream.stop();
  process.exit(0);
});
