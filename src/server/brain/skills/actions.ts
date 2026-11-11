import type { BrainSkill, SkillSources } from "./types";

interface ActionSpec {
  /** The quick action's id in the dashboard's registry. */
  action: string;
  description: string;
  examples: string[];
}

/** The dashboard quick actions the mini brain may run. All are marked safe in the action registry. */
const ACTIONS: ActionSpec[] = [
  { action: "open-vscode", description: "asks to open VS Code", examples: ["open vs code", "open visual studio code"] },
  { action: "open-obsidian", description: "asks to open Obsidian", examples: ["open obsidian", "start obsidian"] },
  {
    action: "take-notes",
    description: "asks to take, write or jot down a note",
    examples: ["take a note", "jot down a note", "I need to note something"],
  },
  {
    action: "take-screenshot",
    description: "asks for a screenshot of the screen",
    examples: ["take a screenshot", "screenshot my screen"],
  },
  {
    action: "welcome-routine",
    description: "asks to start the day or run the welcome routine",
    examples: ["start my day", "good morning, set me up"],
  },
];

export function actionSkills(sources: Pick<SkillSources, "runAction">): BrainSkill[] {
  return ACTIONS.map(({ action, description, examples }) => ({
    id: `action.${action}`,
    description,
    examples,
    needsInternet: false,
    async run() {
      const result = await sources.runAction(action);
      return result.ok
        ? { ok: true, reply: result.message }
        : { ok: false, reply: `I couldn't do that: ${result.message}` };
    },
  }));
}
