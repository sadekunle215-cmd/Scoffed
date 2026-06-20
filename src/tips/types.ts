export interface FeeSample {
  /** Prioritization fee in micro-lamports per compute unit, as reported by the RPC. */
  prioritizationFee: number;
  slot: number;
}

export interface DynamicTipResult {
  tipLamports: number;
  /** The percentile used to derive this tip from the live sample. */
  percentileUsed: number;
  /** Number of live fee samples the tip was derived from. */
  sampleSize: number;
  /** Min/max observed in the live sample, for transparency. */
  observedMinLamports: number;
  observedMaxLamports: number;
  derivedAt: string;
  reasoning: string;
}
