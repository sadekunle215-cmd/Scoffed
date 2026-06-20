# Architecture

> **Note:** Per the bounty requirement, the canonical, judged version of this
> document is hosted externally at: **[ADD YOUR EXTERNAL DOC LINK HERE — Notion/Google Docs/Figma]**.
> This in-repo copy is kept in sync for convenience but the external link is
> the one to submit.

## System overview

This stack solves one problem: get a transaction landed on Solana reliably,
under real and changing network conditions, while producing evidence that
proves it actually happened on real infrastructure.

```
                    ┌─────────────────────┐
                    │   Yellowstone gRPC   │  live slot + leader
                    │  (native SDK client) │  context
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Leader Window      │  "is now a good time
                    │   Detection          │   to submit?"
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    ▼                     │
          │         ┌─────────────────────┐          │
          │         │   Tip Engine         │          │
          │         │  (live fee sampling, │          │
          │         │   no hardcoded $)    │          │
          │         └──────────┬──────────┘          │
          │                    │                      │
          │         ┌──────────▼──────────┐          │
          │         │   Bundle Builder     │          │
          │         │  + Simulation        │          │
          │         └──────────┬──────────┘          │
          │                    │                      │
          │         ┌──────────▼──────────┐          │
          │         │  Jito Block Engine   │          │
          │         │  (sendBundle)        │          │
          │         └──────────┬──────────┘          │
          │                    │                      │
          │         ┌──────────▼──────────┐          │
          │         │  Bundle Status Poll  │◄─────────┘ (stream-confirmed
          │         │  + RPC cross-check   │              landing, not
          │         └──────────┬──────────┘              RPC-only)
          │                    │
          │          landed?   │  failed?
          │      ┌─────────────┴─────────────┐
          │      ▼                           ▼
          │ ┌─────────┐           ┌─────────────────────┐
          │ │ Lifecycle│           │  Failure Classifier  │
          │ │  Logged  │           │  (4 categories)      │
          │ └─────────┘           └──────────┬──────────┘
          │                                   │
          │                        ┌──────────▼──────────┐
          │                        │   AI Agent (GPT)      │
          │                        │  - observes evidence  │
          │                        │  - reasons in prose    │
          │                        │  - decides action       │
          │                        └──────────┬──────────┘
          │                                   │ decision
          │                   ┌───────────────┴───────────────┐
          │                   ▼ shouldRetry=false              ▼ shouldRetry=true
          │              abandon, logged                 ┌─────────────┐
          │                                               │  Recovery    │
          │                                               │  (fresh      │
          │                                               │   blockhash, │
          │                                               │   new tip)   │
          │                                               └──────┬──────┘
          └──────────────────────────────────────────────────────┘
                              resubmit (back to Bundle Builder)
```

## Components

### Streaming (`src/streaming/`)
Primary transport is the native Yellowstone gRPC SDK
(`yellowstone-slot-stream.ts`), subscribing directly to slot updates with
capped-exponential-backoff reconnection and backpressure (the consumer
callback is awaited before the next message is processed). A `grpcurl`-based
fallback exists for environments where the native client can't connect, and
a plain Solana-websocket transport exists so the project is runnable with
zero Yellowstone credentials. Each transport tags its evidence with its own
`source` field — they are never conflated.

### Leaders (`src/leaders/`)
Fetches the live leader schedule and, separately, *learns* which validator
identities have actually landed a Jito bundle by cross-referencing the
lifecycle log against the schedule after each run. The leader-window check
recommends "submit" or "wait" based on that learned evidence, not a static
validator allowlist.

### Tips (`src/tips/`)
Samples live `getRecentPrioritizationFees` data and derives a tip as a
percentile of that live sample, scaled by the compute unit budget. The only
static number involved is an absolute floor used solely if the live sample
is empty — it is never substituted when live data is available, and every
derivation logs its full reasoning and the observed min/max for transparency.

### Jito (`src/jito/`)
Tip accounts are fetched live from the Block Engine's `getTipAccounts`
(short-lived cache, not a hardcoded address list). Bundles are constructed,
simulated pre-flight, and submitted exclusively through `sendBundle` — there
is no plain `sendTransaction` fallback path. Bundle status polling treats
early `Invalid`/`Pending` reads as non-terminal and keeps polling until
`Landed`/`Failed` or timeout.

### Lifecycle (`src/lifecycle/`)
Every attempt is tracked through `submitted → processed → confirmed →
finalized`, with a wall-clock timestamp and slot number recorded at each
transition. Latency deltas between every pair of stages are computed and
persisted. Stream-based bundle status is the primary landing signal; RPC
`getSignatureStatuses` is used only as a secondary cross-check across
commitment levels, per the requirement that RPC polling alone is
insufficient.

### Failures (`src/failures/`)
Classifies raw error/log evidence into one of the four required categories
(`expired_blockhash`, `fee_too_low`, `compute_exceeded`, `bundle_failure`),
falling back to `unknown` rather than forcing a guess.

### Recovery (`src/recovery/`)
Purely mechanical: fetch a fresh blockhash, recalculate the tip from live
data, rebuild and sign a new transaction. This module never decides
*whether* to retry — it only executes what the agent decided.

### Agent (`src/agent/`)
The decision-making layer. Calls a real LLM (OpenAI's GPT-4o by default, via
`response_format: json_object`) per failure, passing it the classified
failure type, raw evidence, slot/blockhash gap, tip used vs. live fee range,
and prior retry count for that lineage. The model returns structured JSON
with its action, full prose reasoning, and confidence. Every decision is
logged verbatim to `data/lifecycle/agent-decisions.jsonl`. The recovery and
resubmission code path only executes if the agent's own decision says to
retry — there is no hardcoded override.

### Evidence (`src/evidence/`)
Aggregates the lifecycle log into summary statistics (latency means, tip
ranges, failure breakdown, agent decision counts) used to generate the
evidence report and dashboard, and to answer the README's three questions
with real numbers from the actual run.

## Failure handling strategy

Every external call (RPC, Jito Block Engine, Yellowstone stream, LLM API)
can fail independently. The design principle: **failures are classified and
logged, never silently swallowed**. A failed simulation halts before
submission and is logged as such. A failed bundle submission is classified
and logged. A stream disconnect triggers bounded reconnection with backoff,
not an unbounded retry loop. The one case where the system *intentionally*
declines to recover by itself is the AI agent's `abandon` decision — that is
treated as a valid, logged outcome, not an error.

## AI agent responsibilities

The agent owns exactly one class of decision: **given a real failure, decide
whether and how to retry**. It does not decide tip amounts for successful
submissions (that's the deterministic tip engine, intentionally — mixing the
two would blur the line between "AI reasoning" and "infrastructure logic"
the bounty asks to keep separate) and does not decide submission timing
(that's the leader-window check). This keeps the AI layer's blast radius
narrow, auditable, and exactly aligned with the bounty's mandatory
fault-injection/autonomous-recovery requirement.
