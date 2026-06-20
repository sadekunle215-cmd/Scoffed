export interface EvidenceSummary {
  generatedAt: string;
  network: string;
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  retryAttempts: number;
  failureBreakdown: Record<string, number>;
  latency: {
    meanSubmittedToProcessedMs: number | null;
    meanProcessedToConfirmedMs: number | null;
    meanSubmittedToConfirmedMs: number | null;
    meanSubmittedToFinalizedMs: number | null;
  };
  tips: {
    minLamports: number | null;
    maxLamports: number | null;
    meanLamports: number | null;
  };
  agentDecisionCount: number;
  autonomousRecoveryCount: number;
}
