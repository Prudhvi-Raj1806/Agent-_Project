import { expect, it } from "vitest";
import { createOllamaClient } from "../ollama";
import { CHOICE_CHAT, CHOICE_HERMES, choiceIds, createRouter } from "../router";
import { createSkills, defaultSkillSources } from "../skills";
import phrases from "./phrases.json";

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
  const router = createRouter(client, model, skills);

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
    const { decision } = await router.classify({ state: text, question: "choice", schema: ids });
    times.push(performance.now() - started);
    if (decision === expected) {
      right += 1;
    } else {
      misses.push(`  "${text}" -> ${decision} (wanted ${expected})`);
      if (expected === CHOICE_HERMES && decision === CHOICE_CHAT) hermesAsChat.push(text);
    }
  }

  const judged = phrases.length - skipped;
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
