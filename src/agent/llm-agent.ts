import OpenAI from "openai";
import { env } from "../config/env.js";
import { logAgentDecision } from "./decision-log.js";
import type { AgentDecision, AgentDiagnosisInput } from "./types.js";

const SYSTEM_PROMPT = `You are an autonomous operations agent embedded inside a live Solana
transaction-submission stack. Your job is to look at a real failed Jito bundle
submission and decide what should happen next. You are not a rubber stamp:
you must actually reason about the specific evidence given to you, and your
decision determines real behavior in the system (whether it retries, with
what tip adjustment, or gives up).

You will be given:
- The classified failure type and the raw evidence that led to that classification
- The slot the failed transaction's blockhash was fetched at, and the current slot
- The tip that was used, and the recent live fee range observed on the network
- How many times this same logical submission has already been retried

Respond with a JSON object only, in this exact shape:
{
  "action": "refresh_blockhash_and_retry" | "increase_tip_and_retry" | "wait_and_retry" | "abandon",
  "reasoning": "<your full reasoning, 2-5 sentences, referencing the specific numbers you were given>",
  "shouldRetry": true | false,
  "recommendedTipAdjustment": "increase" | "same" | "decrease",
  "confidence": <number between 0 and 1>
}

Guidance for your reasoning (apply judgment, do not treat this as a lookup table):
- A blockhash gap (currentSlot - blockhashSlot) much larger than ~150 slots strongly
  suggests the blockhash had already expired before submission even completed —
  refreshing the blockhash alone should fix this.
- If the tip used was at or below the low end of the observed recent fee range,
  the bundle may simply have been underpriced relative to current demand.
- If a lineage has already been retried several times with the same kind of
  failure recurring, blindly retrying again with no change is unlikely to help —
  consider recommending a tip increase, a wait, or abandoning if retries are
  clearly not converging.
- Be honest in your confidence score; do not default to 0.9 out of habit.`;

function buildUserPrompt(input: AgentDiagnosisInput): string {
  const gap =
    input.context.currentSlot - (input.context.blockhashSlot ?? input.context.currentSlot);
  return `Failure type: ${input.failure.type}
Raw evidence: ${input.failure.rawEvidence}

Blockhash fetched at slot: ${input.context.blockhashSlot ?? "unknown"}
Current slot: ${input.context.currentSlot}
Slot gap (current - blockhash): ${gap}

Tip used for this attempt: ${input.context.tipLamportsUsed} lamports
Recently observed live fee range: ${input.context.observedRecentFeeMinLamports} to ${input.context.observedRecentFeeMaxLamports} lamports
Prior retry count for this submission lineage: ${input.context.priorRetryCountForThisLineage}

Decide what should happen next and respond with the JSON object only.`;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Agent response did not contain a JSON object: ${text}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Calls a real LLM to diagnose a failed bundle submission and decide
 * the retry strategy. This is the agent's headline decision: the retry
 * flow downstream (src/recovery) only executes what this function
 * decides — there is no hardcoded "always retry" or "always refresh
 * blockhash" branch bypassing it.
 */
export async function diagnoseFailureAndDecide(
  input: AgentDiagnosisInput,
): Promise<AgentDecision> {
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. The agent requires a real LLM call and " +
        "has no hardcoded fallback decision logic by design.",
    );
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: env.AGENT_MODEL,
    max_tokens: 600,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ],
  });

  const responseText = response.choices[0]?.message?.content;
  if (!responseText) {
    throw new Error("Agent response contained no content.");
  }

  const parsed = extractJson(responseText) as {
    action: AgentDecision["action"];
    reasoning: string;
    shouldRetry: boolean;
    recommendedTipAdjustment: AgentDecision["recommendedTipAdjustment"];
    confidence: number;
  };

  const decision: AgentDecision = {
    attemptId: input.attemptId,
    action: parsed.action,
    reasoning: parsed.reasoning,
    shouldRetry: parsed.shouldRetry,
    recommendedTipAdjustment: parsed.recommendedTipAdjustment,
    confidence: parsed.confidence,
    decidedAt: new Date().toISOString(),
    model: env.AGENT_MODEL,
  };

  logAgentDecision(decision);
  return decision;
}
