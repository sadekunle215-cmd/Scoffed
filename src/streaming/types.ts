export interface SlotStreamEvent {
  slot: number;
  parent: number | null;
  status: "processed" | "confirmed" | "finalized" | "unknown";
  receivedAt: string;
  /** Which transport produced this event, for evidence transparency. */
  source: "yellowstone" | "yellowstone_grpcurl" | "solana_ws";
}

export interface SlotStream {
  start(onEvent: (event: SlotStreamEvent) => void): Promise<void>;
  stop(): Promise<void>;
}

export interface StreamEvidenceSummary {
  source: SlotStreamEvent["source"];
  transport: string;
  eventsCaptured: number;
  startedAt: string;
  endedAt: string;
  firstSlot: number | null;
  lastSlot: number | null;
  reconnectCount: number;
}
