import { test } from "node:test";
import assert from "node:assert";

test("classifyFailure detects expired blockhash", async () => {
  const { classifyFailure } = await import("../src/failures/classifier.js");
  const result = classifyFailure({ raw: "BlockhashNotFound: blockhash not found" });
  assert.strictEqual(result.type, "expired_blockhash");
});

test("classifyFailure detects compute exceeded", async () => {
  const { classifyFailure } = await import("../src/failures/classifier.js");
  const result = classifyFailure({ raw: "Program failed: exceeded CUs meter" });
  assert.strictEqual(result.type, "compute_exceeded");
});

test("classifyFailure falls back to unknown for unrecognized errors", async () => {
  const { classifyFailure } = await import("../src/failures/classifier.js");
  const result = classifyFailure({ raw: "some completely novel error string" });
  assert.strictEqual(result.type, "unknown");
});

test("computeLatencyDeltas returns null when stages are missing", async () => {
  const { computeLatencyDeltas } = await import("../src/lifecycle/types.js");
  const deltas = computeLatencyDeltas({
    attemptId: "x",
    signature: null,
    bundleId: null,
    tipLamports: 0,
    blockhashSlot: null,
    stages: [],
    failure: null,
    isRetry: false,
    retriedFromAttemptId: null,
  });
  assert.strictEqual(deltas.submittedToConfirmedMs, null);
});
