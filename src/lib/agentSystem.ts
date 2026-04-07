export enum AgentType { Daily = "daily", Nudge = "nudge", Expiry = "expiry", GapAnalyst = "gap_analyst" }
export interface Agent { type: AgentType; brain_id: string; scheduled_at: string; }
export function createAgent(type: AgentType, brainId: string): Agent {
  return { type, brain_id: brainId, scheduled_at: new Date().toISOString() };
}
