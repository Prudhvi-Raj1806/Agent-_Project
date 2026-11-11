import type { BrainSkill } from "./types";

/**
 * Control Computer is the dashboard's one risky action, so the mini brain
 * never runs it. It is still a listed choice, so a spoken request for it gets
 * a pointer to the passcode-gated button instead of being handed to Hermes or
 * answered as chat.
 */
export function controlComputerSkill(): BrainSkill {
  return {
    id: "control-computer",
    description: "asks the assistant to take control of the computer, screen, mouse or keyboard",
    examples: ["control my computer", "take over my screen"],
    needsInternet: false,
    async run() {
      return { ok: true, reply: "That one needs your passcode. Use the Control Computer button." };
    },
  };
}
