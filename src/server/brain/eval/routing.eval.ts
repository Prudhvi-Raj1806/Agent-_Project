import { expect, it } from "vitest";
import { createOllamaClient } from "../ollama";
import { routeRequest } from "../route-request";
import { CHOICE_CHAT, CHOICE_HERMES, choiceIds } from "../router";
import { createSkills, defaultSkillSources } from "../skills";
import heldout from "./heldout.json";
import tuned from "./phrases.json";

/**
 * Two phrase sets. `phrases.json` is the working set: the router's wording and
 * rules were adjusted while looking at its misses, so its score flatters the
 * router. `heldout.json` is for phrases written afterwards and not yet looked
 * at; run it with BRAIN_SET=heldout to see how routing does on fresh phrasing.
 *
 * Once a held-out batch has been looked at it is spent: move it into
 * `phrases.json`, fix what it showed in general terms, and write new phrases
 * for the next look. Three batches were spent this way while building the
 * router; the last clean look scored 20 of 26, with 3 of 16 do-something
 * requests answered as chat, which is why `route-request.ts` has two guards
 * besides the model and why the chat prompt forbids claiming an action.
 */
const phrases = process.env.BRAIN_SET === "heldout" ? heldout : tuned;

/**
 * The routing check: runs every phrase through the real local model. Not part
 * of the normal suite because it needs Ollama. Run with `npm run brain:eval`
 * (set BRAIN_MODEL to try another model).
 *
 * Passes when at least 90% of phrases are routed right and no request that
 * needs Hermes is answered as chat, which is the mistake that would have the
 * small model making up an answer.
 */
const PASS_RATE = 0.9;

it("routes real phrases with the local model", async () => {
  const model = process.env.BRAIN_MODEL ?? "phi4-mini";
  const client = createOllamaClient();
  const skills = createSkills(defaultSkillSources());
  const ids = choiceIds(skills);

  if (!(await client.status()).running) throw new Error("Ollama isn't running. Start it, then run the check again.");

  const misses: string[] = [];
  const hermesAsChat: string[] = [];
  let right = 0;
  let skipped = 0;
  const times: number[] = [];

  for (const { text, expect: expected } of phrases) {
    if (!ids.includes(expected)) {
      skipped += 1;
      continue;
    }
    const started = performance.now();
    const decision = await routeRequest(text, { client, model, skills });
    times.push(performance.now() - started);
    if (decision === expected) {
      right += 1;
    } else {
      misses.push(`  "${text}" -> ${decision} (wanted ${expected})`);
      if (expected === CHOICE_HERMES && decision === CHOICE_CHAT) hermesAsChat.push(text);
    }
  }

  const judged = phrases.length - skipped;
  if (judged === 0) throw new Error("This phrase set is empty. Add phrases to it first.");
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] ?? 0;
  console.log(
    [
      `model ${model}: ${right}/${judged} right (${((right / judged) * 100).toFixed(1)}%), ${skipped} skipped, median ${Math.round(median)} ms`,
      ...misses,
    ].join("\n"),
  );

  expect(hermesAsChat, "requests that need Hermes were answered as chat").toEqual([]);
  expect(right / judged).toBeGreaterThanOrEqual(PASS_RATE);
});
