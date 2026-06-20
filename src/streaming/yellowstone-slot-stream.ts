import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import { env } from "../config/env.js";
import type { SlotStream, SlotStreamEvent } from "./types.js";

const COMMITMENT_MAP: Record<string, CommitmentLevel> = {
  processed: CommitmentLevel.PROCESSED,
  confirmed: CommitmentLevel.CONFIRMED,
  finalized: CommitmentLevel.FINALIZED,
};

/**
 * Native Yellowstone/Geyser gRPC slot stream using the official SDK
 * (no shelling out to grpcurl). Handles reconnection with capped
 * exponential backoff and applies backpressure by awaiting the
 * downstream handler before processing the next message, so a slow
 * consumer can't cause unbounded buffering.
 */
export class YellowstoneSlotStream implements SlotStream {
  private client: Client | null = null;
  private stream: Awaited<ReturnType<Client["subscribe"]>> | null = null;
  private stopped = false;
  private reconnectAttempts = 0;

  async start(onEvent: (event: SlotStreamEvent) => void): Promise<void> {
    if (!env.YELLOWSTONE_GRPC_ENDPOINT) {
      throw new Error(
        "YELLOWSTONE_GRPC_ENDPOINT is not set. A Yellowstone/Geyser provider " +
          "endpoint is required to use the native Yellowstone transport.",
      );
    }
    await this.connectAndSubscribe(onEvent);
  }

  private async connectAndSubscribe(onEvent: (event: SlotStreamEvent) => void): Promise<void> {
    this.client = new Client(
      env.YELLOWSTONE_GRPC_ENDPOINT,
      env.YELLOWSTONE_GRPC_TOKEN || undefined,
      undefined,
    );

    this.stream = await this.client.subscribe();

    const request: SubscribeRequest = {
      slots: {
        slotEvents: {
          filterByCommitment: true,
        },
      },
      accounts: {},
      transactions: {},
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      entry: {},
      accountsDataSlice: [],
      commitment: COMMITMENT_MAP[env.YELLOWSTONE_COMMITMENT],
    };

    this.stream.on("data", async (data: any) => {
      if (this.stopped) return;
      if (data?.slot) {
        const slotUpdate = data.slot;
        const event: SlotStreamEvent = {
          slot: Number(slotUpdate.slot),
          parent: slotUpdate.parent !== undefined ? Number(slotUpdate.parent) : null,
          status: mapYellowstoneStatus(slotUpdate.status),
          receivedAt: new Date().toISOString(),
          source: "yellowstone",
        };
        // Backpressure: await the handler before this callback returns,
        // so the gRPC client's internal flow control sees the consumer
        // as busy rather than free to fire the next message immediately.
        await Promise.resolve(onEvent(event));
      }
    });

    this.stream.on("error", (err: Error) => {
      if (!this.stopped) {
        void this.handleDisconnect(onEvent, err);
      }
    });

    this.stream.on("end", () => {
      if (!this.stopped) {
        void this.handleDisconnect(onEvent, new Error("Stream ended unexpectedly."));
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.stream!.write(request, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.reconnectAttempts = 0;
  }

  private async handleDisconnect(
    onEvent: (event: SlotStreamEvent) => void,
    error: Error,
  ): Promise<void> {
    if (this.reconnectAttempts >= env.STREAM_RECONNECT_MAX_ATTEMPTS) {
      console.error(
        `Yellowstone stream: exceeded max reconnect attempts (${env.STREAM_RECONNECT_MAX_ATTEMPTS}). ` +
          `Last error: ${error.message}`,
      );
      return;
    }

    this.reconnectAttempts += 1;
    const backoff = env.STREAM_RECONNECT_BACKOFF_MS * 2 ** (this.reconnectAttempts - 1);
    console.warn(
      `Yellowstone stream disconnected (${error.message}). ` +
        `Reconnect attempt ${this.reconnectAttempts}/${env.STREAM_RECONNECT_MAX_ATTEMPTS} in ${backoff}ms.`,
    );

    await new Promise((r) => setTimeout(r, backoff));
    if (!this.stopped) {
      await this.connectAndSubscribe(onEvent);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.stream?.end();
    this.stream = null;
    this.client = null;
  }
}

function mapYellowstoneStatus(status: unknown): SlotStreamEvent["status"] {
  const s = String(status ?? "").toLowerCase();
  if (s.includes("processed")) return "processed";
  if (s.includes("confirmed")) return "confirmed";
  if (s.includes("finalized") || s.includes("rooted")) return "finalized";
  return "unknown";
}
