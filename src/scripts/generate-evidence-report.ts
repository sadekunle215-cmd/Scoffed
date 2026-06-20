import { buildEvidenceSummary } from "../evidence/evidence-summary.js";
import { readJsonl } from "../lifecycle/log-writer.js";
import { explorerSlotUrl, explorerTxUrl } from "../solana/cluster.js";
import fs from "node:fs";
import type { LifecycleRecord } from "../lifecycle/types.js";

const summary = buildEvidenceSummary();
const successes = readJsonl<LifecycleRecord>("data/lifecycle/jito-bundles.jsonl");
const failures = readJsonl<LifecycleRecord>("data/lifecycle/jito-bundle-failures.jsonl");
const all = [...successes, ...failures].sort(
  (a, b) =>
    new Date(a.stages[0]?.at ?? 0).getTime() - new Date(b.stages[0]?.at ?? 0).getTime(),
);

function fmtRow(r: LifecycleRecord): string {
  const submitted = r.stages.find((s) => s.stage === "submitted");
  const confirmed = r.stages.find((s) => s.stage === "confirmed");
  const slot = confirmed?.slot ?? submitted?.slot ?? r.blockhashSlot ?? "—";
  const status = r.failure ? `FAILED (${r.failure.type})` : "LANDED";
  const link = r.signature ? `[tx](${explorerTxUrl(r.signature)})` : "—";
  const slotLink =
    typeof slot === "number" ? `[${slot}](${explorerSlotUrl(slot)})` : String(slot);
  return `| ${r.attemptId.slice(0, 8)} | ${status} | ${slotLink} | ${r.tipLamports} | ${r.isRetry ? "yes" : "no"} | ${link} |`;
}

const rows = all.map(fmtRow).join("\n");

const md = `# Evidence Report

Generated: ${summary.generatedAt}
Network: ${summary.network}

## Summary

- Total attempts: ${summary.totalAttempts}
- Successful: ${summary.successfulAttempts}
- Failed: ${summary.failedAttempts}
- Retries: ${summary.retryAttempts}
- Agent decisions logged: ${summary.agentDecisionCount}
- Autonomous recovery events logged: ${summary.autonomousRecoveryCount}

### Failure breakdown

${Object.entries(summary.failureBreakdown)
  .map(([type, count]) => `- ${type}: ${count}`)
  .join("\n") || "- none recorded"}

### Latency (mean, across all recorded attempts)

- submitted → processed: ${summary.latency.meanSubmittedToProcessedMs ?? "—"} ms
- processed → confirmed: ${summary.latency.meanProcessedToConfirmedMs ?? "—"} ms
- submitted → confirmed: ${summary.latency.meanSubmittedToConfirmedMs ?? "—"} ms
- submitted → finalized: ${summary.latency.meanSubmittedToFinalizedMs ?? "—"} ms

### Tips

- min: ${summary.tips.minLamports ?? "—"} lamports
- max: ${summary.tips.maxLamports ?? "—"} lamports
- mean: ${summary.tips.meanLamports ?? "—"} lamports

## Submission log

| Attempt | Outcome | Slot | Tip (lamports) | Retry? | Link |
|---|---|---|---|---|---|
${rows}

---

*All slot numbers above are explorer-linked and independently verifiable.*
`;

fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/evidence-report.md", md, "utf-8");
console.log("Wrote docs/evidence-report.md");
console.log(JSON.stringify(summary, null, 2));
