export interface LeaderScheduleEntry {
  slot: number;
  leaderIdentity: string;
}

export interface LeaderWindowCheck {
  currentSlot: number;
  currentLeader: string | null;
  isObservedJitoLeader: boolean;
  recommendation: "submit" | "wait";
  reasoning: string;
}

export interface ObservedJitoLeadersFile {
  updatedAt: string;
  /** Validator identities observed to have landed a Jito bundle in their slot window. */
  identities: string[];
}
