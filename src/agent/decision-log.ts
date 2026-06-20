import { appendJsonl } from "../lifecycle/log-writer.js";
import type { AgentDecision } from "./types.js";

const AGENT_DECISIONS_PATH = "data/lifecycle/agent-decisions.jsonl";
const AUTONOMOUS_RECOVERY_PATH = "data/lifecycle/autonomous-recovery.jsonl";

export function logAgentDecision(decision: AgentDecision): void {
  appendJsonl(AGENT_DECISIONS_PATH, decision);
}

export function logAutonomousRecoveryEvent(event: Record<string, unknown>): void {
  appendJsonl(AUTONOMOUS_RECOVERY_PATH, {
    ...event,
    loggedAt: new Date().toISOString(),
  });
}
