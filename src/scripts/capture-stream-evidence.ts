import { createSlotStream } from "../streaming/create-slot-stream.js";
import { appendJsonl, writeJson } from "../lifecycle/log-writer.js";
import { env } from "../config/env.js";
import type { SlotStreamEvent, StreamEvidenceSummary } from "../streaming/types.js";

const EVIDENCE_LOG = "data/stream/slot-stream-evidence.jsonl";
const SUMMARY_PATH = "data/stream/latest-stream-evidence-summary.json";

const target = env.STREAM_EVIDENCE_EVENT_COUNT;
console.log(`Capturing ${target} slot stream events via ${env.SLOT_STREAM_SOURCE}...`);

const stream = createSlotStream();
const events: SlotStreamEvent[] = [];
const startedAt = new Date().toISOString();

await new Promise<void>((resolve, reject) => {
  stream
    .start((event) => {
      events.push(event);
      appendJsonl(EVIDENCE_LOG, event);
      console.log(`[${events.length}/${target}] slot=${event.slot} status=${event.status}`);
      if (events.length >= target) {
        resolve();
      }
    })
    .catch(reject);
});

await stream.stop();

const summary: StreamEvidenceSummary = {
  source: env.SLOT_STREAM_SOURCE === "solana_ws" ? "solana_ws" : (env.SLOT_STREAM_SOURCE as any),
  transport: env.SLOT_STREAM_SOURCE,
  eventsCaptured: events.length,
  startedAt,
  endedAt: new Date().toISOString(),
  firstSlot: events[0]?.slot ?? null,
  lastSlot: events[events.length - 1]?.slot ?? null,
  reconnectCount: 0,
};

writeJson(SUMMARY_PATH, summary);
console.log(`Captured ${events.length} events. Summary written to ${SUMMARY_PATH}.`);
process.exit(0);
