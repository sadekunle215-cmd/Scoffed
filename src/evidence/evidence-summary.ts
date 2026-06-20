import { readJsonl, writeJson } from "../lifecycle/log-writer.js";
import { computeLatencyDeltas } from "../lifecycle/types.js";
import { env } from "../config/env.js";
import type { LifecycleRecord } from "../lifecycle/types.js";
import type { EvidenceSummary } from "./types.js";

const SUCCESS_LOG = "data/lifecycle/jito-bundles.jsonl";
const FAILURE_LOG = "data/lifecycle/jito-bundle-failures.jsonl";
const AGENT_DECISIONS_LOG = "data/lifecycle/agent-decisions.jsonl";
const RECOVERY_LOG = "data/lifecycle/autonomous-recovery.jsonl";
const OUTPUT_PATH = "data/lifecycle/latest-evidence-summary.json";

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function buildEvidenceSummary(): EvidenceSummary {
  const successes = readJsonl<LifecycleRecord>(SUCCESS_LOG);
  const failures = readJsonl<LifecycleRecord>(FAILURE_LOG);
  const allRecords = [...successes, ...failures];

  const failureBreakdown: Record<string, number> = {};
  for (const f of failures) {
    const type = f.failure?.type ?? "unknown";
    failureBreakdown[type] = (failureBreakdown[type] ?? 0) + 1;
  }

  const deltas = allRecords.map(computeLatencyDeltas);
  const tipValues = allRecords.map((r) => r.tipLamports).filter((t) => typeof t === "number");

  const agentDecisions = readJsonl(AGENT_DECISIONS_LOG);
  const recoveryEvents = readJsonl(RECOVERY_LOG);

  const summary: EvidenceSummary = {
    generatedAt: new Date().toISOString(),
    network: env.NETWORK,
    totalAttempts: allRecords.length,
    successfulAttempts: successes.length,
    failedAttempts: failures.length,
    retryAttempts: allRecords.filter((r) => r.isRetry).length,
    failureBreakdown,
    latency: {
      meanSubmittedToProcessedMs: mean(
        deltas.map((d) => d.submittedToProcessedMs).filter((x): x is number => x !== null),
      ),
      meanProcessedToConfirmedMs: mean(
        deltas.map((d) => d.processedToConfirmedMs).filter((x): x is number => x !== null),
      ),
      meanSubmittedToConfirmedMs: mean(
        deltas.map((d) => d.submittedToConfirmedMs).filter((x): x is number => x !== null),
      ),
      meanSubmittedToFinalizedMs: mean(
        deltas.map((d) => d.submittedToFinalizedMs).filter((x): x is number => x !== null),
      ),
    },
    tips: {
      minLamports: tipValues.length ? Math.min(...tipValues) : null,
      maxLamports: tipValues.length ? Math.max(...tipValues) : null,
      meanLamports: mean(tipValues),
    },
    agentDecisionCount: agentDecisions.length,
    autonomousRecoveryCount: recoveryEvents.length,
  };

  writeJson(OUTPUT_PATH, summary);
  return summary;
}
