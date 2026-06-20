import { buildEvidenceSummary } from "../evidence/evidence-summary.js";
import { readJsonl } from "../lifecycle/log-writer.js";
import { explorerSlotUrl, explorerTxUrl } from "../solana/cluster.js";
import fs from "node:fs";
import type { LifecycleRecord, LatencyDeltas } from "../lifecycle/types.js";
import { computeLatencyDeltas } from "../lifecycle/types.js";
import type { AgentDecision } from "../agent/types.js";

const summary = buildEvidenceSummary();
const successes = readJsonl<LifecycleRecord>("data/lifecycle/jito-bundles.jsonl");
const failures = readJsonl<LifecycleRecord>("data/lifecycle/jito-bundle-failures.jsonl");
const decisions = readJsonl<AgentDecision>("data/lifecycle/agent-decisions.jsonl");

const all = [...successes, ...failures].sort(
  (a, b) => new Date(a.stages[0]?.at ?? 0).getTime() - new Date(b.stages[0]?.at ?? 0).getTime(),
);

const STAGES = ["submitted", "processed", "confirmed", "finalized"] as const;

function timelineHtml(record: LifecycleRecord, deltas: LatencyDeltas): string {
  const stageMap = new Map(record.stages.map((s) => [s.stage, s]));
  const nodes = STAGES.map((stage, i) => {
    const present = stageMap.has(stage);
    const isFailurePoint = record.failure && !present && i > 0 && !stageMap.has(STAGES[i - 1]);
    const cls = present ? "node node--hit" : record.failure ? "node node--missed" : "node node--pending";
    const slot = stageMap.get(stage)?.slot;
    const label = slot !== undefined && slot !== null ? slot : "—";
    return `<div class="${cls}" title="${stage}${slot ? ` @ slot ${slot}` : ""}"><span class="node-dot"></span><span class="node-label">${stage}</span><span class="node-slot">${label}</span></div>`;
  });

  const deltaLabels = [
    deltas.submittedToProcessedMs,
    deltas.processedToConfirmedMs,
    deltas.submittedToFinalizedMs !== null && deltas.submittedToConfirmedMs !== null
      ? deltas.submittedToFinalizedMs - deltas.submittedToConfirmedMs
      : null,
  ];

  let html = '<div class="timeline">';
  for (let i = 0; i < nodes.length; i++) {
    html += nodes[i];
    if (i < nodes.length - 1) {
      const d = deltaLabels[i];
      html += `<div class="connector"><span class="connector-delta">${d !== null ? d + "ms" : ""}</span></div>`;
    }
  }
  html += "</div>";
  return html;
}

function rowHtml(record: LifecycleRecord): string {
  const deltas = computeLatencyDeltas(record);
  const outcomeClass = record.failure ? "outcome outcome--failed" : "outcome outcome--landed";
  const outcomeLabel = record.failure ? `FAILED · ${record.failure.type}` : "LANDED";
  const sigLink = record.signature
    ? `<a href="${explorerTxUrl(record.signature)}" target="_blank" rel="noopener">tx ↗</a>`
    : "—";
  const retryBadge = record.isRetry ? `<span class="badge badge--retry">retry</span>` : "";

  return `
  <tr class="attempt-row">
    <td class="mono dim">${record.attemptId.slice(0, 8)}</td>
    <td><span class="${outcomeClass}">${outcomeLabel}</span> ${retryBadge}</td>
    <td>${timelineHtml(record, deltas)}</td>
    <td class="mono">${record.tipLamports.toLocaleString()}</td>
    <td class="mono">${sigLink}</td>
  </tr>`;
}

function decisionHtml(d: AgentDecision): string {
  return `
  <div class="decision-card">
    <div class="decision-head">
      <span class="mono dim">${d.attemptId.slice(0, 8)}</span>
      <span class="decision-action">${d.action}</span>
      <span class="decision-confidence">confidence ${(d.confidence * 100).toFixed(0)}%</span>
    </div>
    <p class="decision-reasoning">${d.reasoning}</p>
    <div class="decision-meta">model: ${d.model} · ${new Date(d.decidedAt).toLocaleString()}</div>
  </div>`;
}

const rows = all.map(rowHtml).join("\n");
const decisionCards = decisions.map(decisionHtml).join("\n") || '<p class="dim">No agent decisions logged yet.</p>';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Transaction Stack — Evidence Dashboard</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');

  :root {
    --bg: #0B0E11;
    --panel: #11151A;
    --text: #E8EAED;
    --dim: #7C8794;
    --hairline: #2A313B;
    --landed: #7FB88A;
    --failed: #D98E73;
    --retry: #5B8FB0;
    --pending: #3D4450;
  }

  * { box-sizing: border-box; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', sans-serif;
    margin: 0;
    padding: 0 0 64px;
  }

  .mono { font-family: 'JetBrains Mono', monospace; }
  .dim { color: var(--dim); }

  header {
    padding: 48px 32px 32px;
    border-bottom: 1px solid var(--hairline);
  }

  .eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--retry);
    margin: 0 0 8px;
  }

  h1 {
    font-size: 28px;
    font-weight: 600;
    margin: 0 0 4px;
    letter-spacing: -0.01em;
  }

  .subhead {
    color: var(--dim);
    font-size: 14px;
    margin: 0;
  }

  .stats-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1px;
    background: var(--hairline);
    margin: 32px 32px 0;
    border: 1px solid var(--hairline);
  }

  .stat {
    background: var(--panel);
    padding: 20px 16px;
  }

  .stat-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 26px;
    font-weight: 600;
  }

  .stat-label {
    font-size: 11px;
    color: var(--dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-top: 4px;
  }

  .stat-value.landed { color: var(--landed); }
  .stat-value.failed { color: var(--failed); }

  section {
    margin: 48px 32px 0;
  }

  .section-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dim);
    margin: 0 0 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--hairline);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    font-size: 11px;
    color: var(--dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 8px 12px;
    border-bottom: 1px solid var(--hairline);
  }

  td {
    padding: 14px 12px;
    border-bottom: 1px solid var(--hairline);
    vertical-align: middle;
    font-size: 13px;
  }

  td a { color: var(--retry); text-decoration: none; }
  td a:hover { text-decoration: underline; }

  .outcome { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 3px; }
  .outcome--landed { background: rgba(127,184,138,0.12); color: var(--landed); }
  .outcome--failed { background: rgba(217,142,115,0.12); color: var(--failed); }

  .badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; margin-left: 6px; }
  .badge--retry { background: rgba(91,143,176,0.15); color: var(--retry); }

  /* Signature timeline element */
  .timeline {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .node {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 64px;
  }

  .node-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-bottom: 4px;
  }

  .node--hit .node-dot { background: var(--landed); }
  .node--missed .node-dot { background: var(--failed); }
  .node--pending .node-dot { background: var(--pending); border: 1px solid var(--hairline); }

  .node-label {
    font-size: 9px;
    color: var(--dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .node-slot {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--text);
    margin-top: 1px;
  }

  .connector {
    flex: 1;
    height: 1px;
    background: var(--hairline);
    position: relative;
    min-width: 24px;
    margin-bottom: 14px;
  }

  .connector-delta {
    position: absolute;
    top: -16px;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--dim);
    white-space: nowrap;
  }

  .decision-card {
    background: var(--panel);
    border: 1px solid var(--hairline);
    border-left: 2px solid var(--retry);
    padding: 16px 20px;
    margin-bottom: 12px;
  }

  .decision-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .decision-action {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--retry);
  }

  .decision-confidence {
    font-size: 11px;
    color: var(--dim);
    margin-left: auto;
  }

  .decision-reasoning {
    font-size: 13px;
    line-height: 1.5;
    margin: 0 0 8px;
    color: var(--text);
  }

  .decision-meta {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--dim);
  }

  footer {
    margin: 64px 32px 0;
    padding-top: 16px;
    border-top: 1px solid var(--hairline);
    color: var(--dim);
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
  }
</style>
</head>
<body>

<header>
  <p class="eyebrow">Solana Smart Transaction Stack</p>
  <h1>Evidence Dashboard</h1>
  <p class="subhead">Network: ${summary.network} · Generated ${new Date(summary.generatedAt).toLocaleString()}</p>
</header>

<div class="stats-strip">
  <div class="stat"><div class="stat-value">${summary.totalAttempts}</div><div class="stat-label">Total attempts</div></div>
  <div class="stat"><div class="stat-value landed">${summary.successfulAttempts}</div><div class="stat-label">Landed</div></div>
  <div class="stat"><div class="stat-value failed">${summary.failedAttempts}</div><div class="stat-label">Failed</div></div>
  <div class="stat"><div class="stat-value">${summary.retryAttempts}</div><div class="stat-label">Retries</div></div>
  <div class="stat"><div class="stat-value">${summary.latency.meanSubmittedToConfirmedMs ?? "—"}</div><div class="stat-label">Mean ms to confirm</div></div>
  <div class="stat"><div class="stat-value">${summary.tips.meanLamports ? Math.round(summary.tips.meanLamports) : "—"}</div><div class="stat-label">Mean tip (lamports)</div></div>
</div>

<section>
  <p class="section-title">Lifecycle Log — ${all.length} Submissions</p>
  <table>
    <thead>
      <tr><th>Attempt</th><th>Outcome</th><th>Lifecycle</th><th>Tip</th><th>Explorer</th></tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5" class="dim">No submissions recorded yet. Run `pnpm evidence:bundles`.</td></tr>'}
    </tbody>
  </table>
</section>

<section>
  <p class="section-title">Agent Decisions — ${decisions.length} Logged</p>
  ${decisionCards}
</section>

<footer>
  Generated by generate-dashboard.ts · All slot numbers above are independently verifiable on a Solana explorer.
</footer>

</body>
</html>
`;

fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/dashboard.html", html, "utf-8");
console.log("Wrote docs/dashboard.html");
