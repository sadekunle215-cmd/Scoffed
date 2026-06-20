import { getConnection } from "../solana/connection.js";
import type { SlotStream, SlotStreamEvent } from "./types.js";

/**
 * Local-development fallback transport: subscribes to slot notifications
 * over the standard Solana websocket. Does not require Yellowstone
 * provider credentials, so it keeps the project runnable end-to-end
 * with nothing but a public RPC endpoint. Evidence captured through
 * this transport is labeled source="solana_ws", never mislabeled as
 * Yellowstone evidence.
 */
export class SolanaWsSlotStream implements SlotStream {
  private subscriptionId: number | null = null;

  async start(onEvent: (event: SlotStreamEvent) => void): Promise<void> {
    const connection = getConnection();
    this.subscriptionId = connection.onSlotChange((info: { slot: number; parent: number }) => {
      onEvent({
        slot: info.slot,
        parent: info.parent,
        status: "processed",
        receivedAt: new Date().toISOString(),
        source: "solana_ws",
      });
    });
  }

  async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      const connection = getConnection();
      await connection.removeSlotChangeListener(this.subscriptionId);
      this.subscriptionId = null;
    }
  }
}
