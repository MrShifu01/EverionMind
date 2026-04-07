import { describe, it, expect } from "vitest";
import { createAgent, AgentType } from "../../src/lib/agentSystem";
describe("agentSystem (S7-2)", () => {
  it("createAgent returns agent with correct type", () => {
    const agent = createAgent(AgentType.Daily, "brain-1");
    expect(agent.type).toBe(AgentType.Daily);
    expect(agent.brain_id).toBe("brain-1");
  });
  it("createAgent sets scheduled_at", () => {
    const agent = createAgent(AgentType.Nudge, "brain-1");
    expect(agent.scheduled_at).toBeDefined();
  });
});
