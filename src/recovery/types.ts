export interface RecoveryAttempt {
  originalAttemptId: string;
  newAttemptId: string;
  reason: string;
  newBlockhash: string;
  newBlockhashSlot: number;
  newTipLamports: number;
  recoveredAt: string;
}
