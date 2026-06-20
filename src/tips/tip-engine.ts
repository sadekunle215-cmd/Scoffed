import { env } from "../config/env.js";
import { sampleRecentFees } from "./recent-fee-sampler.js";
import type { DynamicTipResult, FeeSample } from "./types.js";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/**
 * Derives a Jito tip entirely from live network conditions sampled at
 * call time. Deliberately avoids static MIN/MAX lamport config: the
 * only "configuration" here is the sample size and percentile, which
 * shape *how* we read live data, not what the tip value floors/ceilings
 * to. A single absolute safety floor (TIP_FLOOR_LAMPORTS_ABSOLUTE_MIN)
 * exists only to avoid a zero-lamport tip if the live sample is empty —
 * it is never the value actually used when live data is available.
 */
export async function calculateDynamicTip(): Promise<DynamicTipResult> {
  const samples: FeeSample[] = await sampleRecentFees();
  const fees = samples.map((s) => s.prioritizationFee).filter((f) => f >= 0);

  if (fees.length === 0) {
    return {
      tipLamports: env.TIP_FLOOR_LAMPORTS_ABSOLUTE_MIN,
      percentileUsed: env.TIP_PERCENTILE,
      sampleSize: 0,
      observedMinLamports: 0,
      observedMaxLamports: 0,
      derivedAt: new Date().toISOString(),
      reasoning:
        "No live prioritization-fee samples were returned by the RPC. " +
        "Fell back to the absolute safety floor rather than inventing a tip value.",
    };
  }

  const sorted = [...fees].sort((a, b) => a - b);
  const windowed = sorted.slice(-env.TIP_FEE_SAMPLE_SIZE);
  const chosenMicroLamportFee = percentile(windowed, env.TIP_PERCENTILE);

  // Convert the sampled prioritization fee (micro-lamports/CU) into an
  // absolute lamport tip by scaling against the configured compute unit
  // budget — this keeps the tip proportional to actual current network
  // pricing rather than a static band.
  const derivedLamports = Math.ceil(
    (chosenMicroLamportFee * env.COMPUTE_UNIT_LIMIT) / 1_000_000,
  );

  const tipLamports = Math.max(derivedLamports, env.TIP_FLOOR_LAMPORTS_ABSOLUTE_MIN);

  return {
    tipLamports,
    percentileUsed: env.TIP_PERCENTILE,
    sampleSize: windowed.length,
    observedMinLamports: sorted[0],
    observedMaxLamports: sorted[sorted.length - 1],
    derivedAt: new Date().toISOString(),
    reasoning:
      `Took the ${env.TIP_PERCENTILE}th percentile prioritization fee ` +
      `(${chosenMicroLamportFee} micro-lamports/CU) across the most recent ` +
      `${windowed.length} live samples, scaled by the ${env.COMPUTE_UNIT_LIMIT} CU budget, ` +
      `yielding ${tipLamports} lamports. No static min/max tip band was applied.`,
  };
}
