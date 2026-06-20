import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { env } from "../config/env.js";
import type { SlotStream, SlotStreamEvent } from "./types.js";

/**
 * Fallback Yellowstone transport that shells out to `grpcurl` against
 * the raw Dragon's Mouth gRPC endpoint. This exists ONLY as a fallback
 * for environments where the native SDK client (yellowstone-slot-stream.ts)
 * cannot establish a connection (e.g. certain TLS/proxy setups). Evidence
 * captured here is explicitly labeled source="yellowstone_grpcurl" and is
 * never conflated with native-SDK evidence in reports. Prefer
 * YellowstoneSlotStream whenever possible; this file is the documented
 * exception path, not the default.
 */
export class YellowstoneGrpcurlSlotStream implements SlotStream {
  private process: ChildProcessWithoutNullStreams | null = null;

  async start(onEvent: (event: SlotStreamEvent) => void): Promise<void> {
    if (!env.YELLOWSTONE_GRPC_ENDPOINT) {
      throw new Error("YELLOWSTONE_GRPC_ENDPOINT is not set.");
    }

    const requestPayload = JSON.stringify({
      slots: { slotEvents: {} },
      commitment: 0,
    });

    const args = [
      "-plaintext",
      "-d",
      requestPayload,
      env.YELLOWSTONE_GRPC_ENDPOINT,
      "geyser.Geyser/Subscribe",
    ];

    this.process = spawn("grpcurl", args);

    let buffer = "";
    this.process.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed?.slot) {
            onEvent({
              slot: Number(parsed.slot.slot),
              parent: parsed.slot.parent !== undefined ? Number(parsed.slot.parent) : null,
              status: "processed",
              receivedAt: new Date().toISOString(),
              source: "yellowstone_grpcurl",
            });
          }
        } catch {
          // Partial/non-JSON line; ignore and continue buffering.
        }
      }
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      console.warn(`grpcurl stderr: ${chunk.toString("utf-8")}`);
    });
  }

  async stop(): Promise<void> {
    this.process?.kill();
    this.process = null;
  }
}
