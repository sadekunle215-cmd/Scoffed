import type { FailureClassification, FailureType } from "../lifecycle/types.js";

interface ClassifyInput {
  /** Raw error message / log string from RPC, simulation, or bundle status. */
  raw: string;
}

const PATTERNS: Array<{ type: FailureType; test: (raw: string) => boolean }> = [
  {
    type: "expired_blockhash",
    test: (raw) =>
      /block\s*hash\s*not\s*found/i.test(raw) ||
      /blockhash.*expired/i.test(raw) ||
      /BlockhashNotFound/i.test(raw),
  },
  {
    type: "fee_too_low",
    test: (raw) =>
      /insufficient.*fee/i.test(raw) ||
      /fee.*too.*low/i.test(raw) ||
      /InsufficientFundsForFee/i.test(raw),
  },
  {
    type: "compute_exceeded",
    test: (raw) =>
      /exceeded.*compute|compute.*exceeded/i.test(raw) ||
      /ComputeBudgetExceeded/i.test(raw) ||
      /exceeded CUs meter/i.test(raw),
  },
  {
    type: "bundle_failure",
    test: (raw) =>
      /bundle.*(rejected|dropped|invalid|failed)/i.test(raw) ||
      /tip.*account.*invalid/i.test(raw),
  },
];

/**
 * Classifies a raw failure string into one of the four required failure
 * categories. Falls back to "unknown" rather than forcing a guess, since
 * an honest "unknown" is more useful evidence than a mislabeled category.
 */
export function classifyFailure(input: ClassifyInput): FailureClassification {
  const match = PATTERNS.find((p) => p.test(input.raw));
  return {
    type: match?.type ?? "unknown",
    message: match
      ? `Classified as ${match.type} from raw evidence pattern match.`
      : "No known failure pattern matched; classified as unknown.",
    rawEvidence: input.raw.slice(0, 2000),
    classifiedAt: new Date().toISOString(),
  };
}
