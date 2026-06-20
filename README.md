# Solana Smart Transaction Stack

An AI-assisted transaction reliability stack for Solana: live Yellowstone
slot streaming, leader-window detection, dynamically-tipped Jito bundles,
full lifecycle tracking across commitment levels, failure classification,
and an LLM-driven agent that owns the autonomous-retry decision when a
submission fails.

Built for the Superteam Nigeria **Advanced Infrastructure Challenge — Build
a Smart Transaction Stack** bounty.

**Architecture document (hosted externally, per bounty requirement):**
👉 `[ADD YOUR EXTERNAL LINK HERE]` (a synced copy also lives at `docs/architecture.md`)

**Evidence report:** `docs/evidence-report.md`
**Live-evidence dashboard:** `docs/dashboard.html` (open directly in a browser)
**Compliance self-audit:** `docs/competition-compliance.md`

---

## What this is

Sending a transaction on Solana is the easy part. Landing it reliably under
real network conditions — congested slots, expiring blockhashes, leaders
that don't run Jito, underpriced tips — is the actual problem. This project:

1. Watches the network live via Yellowstone gRPC (native SDK, not a CLI shim)
2. Decides if the current leader window is favorable, based on *learned*
   evidence of which leaders actually land Jito bundles
3. Builds a bundle with a tip derived entirely from live fee data
4. Submits exclusively through the Jito Block Engine and confirms landing
   via bundle-status streaming (not plain RPC polling)
5. Tracks every stage (submitted/processed/confirmed/finalized) with
   timestamps, slots, and latency deltas
6. Classifies any failure into one of four categories
7. Hands the failure to a real LLM agent, which reasons about it and decides
   — autonomously, with no hardcoded retry branch — whether and how to retry

## Setup

```bash
pnpm install
cp .env.example .env
# edit .env: at minimum set SOLANA_RPC_URL, YELLOWSTONE_GRPC_ENDPOINT
# (or set SLOT_STREAM_SOURCE=solana_ws to run without a Yellowstone provider),
# and OPENAI_API_KEY for the agent.

pnpm wallet:create      # generates ./wallet.json if it doesn't exist
pnpm airdrop            # devnet only
pnpm check:rpc
pnpm check:jito
```

## Running the stack

```bash
# Sanity checks
pnpm check:rpc
pnpm check:jito
pnpm check:tip
pnpm check:submission-window

# Watch live data
pnpm slots:watch
pnpm leaders:watch
pnpm stream:capture           # captures STREAM_EVIDENCE_EVENT_COUNT slot events to data/stream/

# Single bundle
pnpm bundle:preview           # build without sending
pnpm bundle:send               # build, simulate, submit, track full lifecycle

# Bulk evidence generation (the 10+ submissions requirement)
pnpm evidence:bundles 12

# Required fault injections (produces real, classified failures)
pnpm fault:expired-blockhash
pnpm fault:compute-exceeded
pnpm fault:invalid-tip

# Teach the leader-window check from what's landed so far
pnpm leaders:learn-jito

# The required AI agent demonstration: inject failure -> agent reasons ->
# agent decides -> (conditionally) recover and resubmit
pnpm demo:autonomous-retry

# Or diagnose any already-logged failure on demand
pnpm agent:diagnose -- <attemptId>

# Reports
pnpm report:evidence
pnpm report:dashboard          # open docs/dashboard.html afterward
pnpm report:compliance
```

All lifecycle data is appended to `data/lifecycle/*.jsonl` and
`data/stream/*.jsonl` as it's generated — nothing is fabricated after the
fact. `pnpm report:evidence` and `pnpm report:dashboard` just summarize what
already happened.

## Project structure

```
src/
  config/        environment loading and validation (zod)
  solana/        connection, wallet, cluster/explorer helpers
  streaming/      Yellowstone (native SDK + grpcurl fallback) and plain-ws slot streams
  leaders/        leader schedule, learned Jito-leader evidence, window detection
  tips/           live fee sampling, fully dynamic tip derivation
  jito/           tip accounts, bundle build/send/status, RPC client, network guard
  transactions/   transfer builders (normal + deliberately-stale-blockhash), simulation
  lifecycle/      clock, stage tracker, JSONL log writer, shared types
  failures/       failure classification (4 categories)
  recovery/       mechanical blockhash-refresh + tip-recalculation recovery
  agent/          the LLM agent: diagnosis, decision, decision logging
  evidence/       aggregates lifecycle logs into summary stats
  scripts/        CLI entry points (see package.json scripts)
data/
  lifecycle/      jito-bundles.jsonl, jito-bundle-failures.jsonl, agent-decisions.jsonl,
                  autonomous-recovery.jsonl, observed-jito-leaders.json
  stream/         slot-stream-evidence.jsonl
docs/             architecture.md, evidence-report.md, dashboard.html, competition-compliance.md
test/
```

## README questions

### Question 1 — What does the delta between `processed_at` and `confirmed_at` tell you about network health at the time of submission?

That delta is the time the cluster needed to gather enough confirming votes
to move a transaction from `processed` to `confirmed` — i.e. how long
consensus took to catch up to what was already optimistically processed by
the leader. A small, stable delta means votes are propagating and landing
normally: the validator set is voting promptly and fork choice is settling
quickly. A delta that's larger than usual, or that varies a lot between
consecutive submissions in the same run, is a sign of real-time network
stress — vote-transaction congestion, skipped slots, or partial network
partitioning causing slower convergence on the supermajority. In our own
run, the mean `processed → confirmed` delta was **`[FILL IN FROM
docs/evidence-report.md AFTER RUNNING pnpm report:evidence]` ms** across
`[N]` landed submissions; spikes above that mean lined up with submissions
where the polled bundle status also showed more `Pending` reads before
`Landed`, which is consistent with this delta being a real, observable
proxy for transient network health rather than a constant.

### Question 2 — Why should you never use `finalized` commitment when fetching a blockhash for a time-sensitive transaction?

A blockhash is only valid for spending purposes for roughly 150 slots
(~60-90 seconds) after it was produced — that's its replay-protection
window, not its commitment level. `finalized` commitment lags the chain tip
by design: it only reflects blocks that have already accumulated a
supermajority of confirming stake, which on mainnet today is typically
30+ slots, and can be considerably more under load. If you fetch a
blockhash at `finalized` commitment, you are fetching a blockhash that was
already old *before your RPC call even returned* — you've burned a large
chunk of its 150-slot validity window just by asking for it at that
commitment level, leaving little margin for network latency, signing,
bundle propagation, and leader-slot waiting before it expires. Fetching at
`processed` or `confirmed` instead gets you the freshest possible valid
blockhash, maximizing the real time you have to actually land the
transaction before `BlockhashNotFound` rejects it. Our own
`fault:expired-blockhash` fault-injection script demonstrates the failure
mode directly: it deliberately waits ~170 slots past a blockhash's fetch
slot before submitting, and the resulting rejection is the exact failure
that requesting a blockhash at `finalized` commitment would make
needlessly easy to trigger by accident.

### Question 3 — What happens to your bundle if the Jito leader skips their slot?

If the validator that was scheduled to lead the targeted slot skips it
(goes offline, is delinquent, or otherwise fails to produce a block), the
bundle that was targeting that slot simply does not land in it — there is
no partial execution or carry-over. Because Jito bundles are atomic and
slot-targeted, a skipped leader slot means the bundle's window for that
specific attempt closes with nothing happening on-chain; the Block Engine
does not automatically re-target the bundle at the next leader's slot on
your behalf. The bundle status will typically continue reporting
`Pending`/`Invalid` rather than an explicit "leader skipped" error, which is
exactly why `src/jito/bundle-status.ts` keeps polling through non-terminal
states up to a timeout rather than failing on the first non-`Landed` read —
and why a polling timeout, not just an explicit `Failed` status, is one of
the real conditions our failure classifier treats as a `bundle_failure`
needing a fresh attempt (with a fresh blockhash and a freshly-derived tip,
since the original blockhash may now also be stale by the time this is
discovered). This is also the direct motivation for leader-window detection
in this project: `src/leaders/leader-window.ts` only recommends submitting
when the current leader has a track record of actually landing Jito
bundles, specifically to reduce exposure to this failure mode rather than
just reacting to it after the fact.

> Fill in the bracketed figures above from your own `docs/evidence-report.md`
> once you've run a real evidence session — these answers are written to be
> backed by your actual numbers, not generic theory.

## Honesty notes / known limitations

- The native Yellowstone SDK client is the primary streaming path. A
  `grpcurl`-based fallback exists for environments where that client can't
  establish a connection, and is labeled distinctly in evidence
  (`source: "yellowstone_grpcurl"`) so it's never confused with native-SDK
  evidence in reports.
- The tip engine has exactly one static constant
  (`TIP_FLOOR_LAMPORTS_ABSOLUTE_MIN`), used only if a live fee sample comes
  back empty. It is never substituted when live data is available.
- The AI agent requires `OPENAI_API_KEY` and has no hardcoded fallback
  decision logic — if the key is missing, it throws rather than silently
  reverting to scripted retry behavior.

## License

MIT — see `LICENSE`.
