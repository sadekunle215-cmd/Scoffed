import { env } from "../config/env.js";
import { YellowstoneSlotStream } from "./yellowstone-slot-stream.js";
import { YellowstoneGrpcurlSlotStream } from "./yellowstone-grpcurl-slot-stream.js";
import { SolanaWsSlotStream } from "./solana-ws-slot-stream.js";
import type { SlotStream } from "./types.js";

/**
 * Selects the slot-stream transport based on SLOT_STREAM_SOURCE.
 * "yellowstone" (native SDK) is the preferred, primary path for this
 * project. "yellowstone_grpcurl" is kept only as a documented fallback.
 * "solana_ws" exists so the project runs end-to-end without any
 * Yellowstone provider credentials at all.
 */
export function createSlotStream(): SlotStream {
  switch (env.SLOT_STREAM_SOURCE) {
    case "yellowstone":
      return new YellowstoneSlotStream();
    case "yellowstone_grpcurl":
      return new YellowstoneGrpcurlSlotStream();
    case "solana_ws":
      return new SolanaWsSlotStream();
    default:
      throw new Error(`Unknown SLOT_STREAM_SOURCE: ${env.SLOT_STREAM_SOURCE}`);
  }
}
