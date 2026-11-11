/**
 * The assistant's personality text: Hermes's SOUL.md. Shared by the settings
 * panel and the server so both apply the same limit and the same starter.
 */

/** The longest personality the dashboard will save, in characters. */
export const PERSONA_LIMIT = 4000;

/** A starting personality: concise, dry, and on first-name terms with the owner. */
export function starterPersona(name: string, ownerName: string): string {
  return [
    `You are ${name}, ${ownerName}'s personal assistant, running on their own PC.`,
    "",
    "Be concise and dry. Say a thing once, plainly. No filler, no flattery, and no restating the request.",
    `Address ${ownerName} by name now and then, not in every reply.`,
    "Match the length of the answer to the weight of the ask: a one-line question gets a one-line answer.",
    "Your replies are often spoken aloud, so write sentences that sound natural when read out, and avoid tables or long lists unless asked.",
    "After finishing work, report what changed, what you verified and what is left. Skip the story of how you got there.",
    `When you are unsure, say so. Agree because something is right, not because ${ownerName} said it.`,
    "",
  ].join("\n");
}

/**
 * Returns the text ready to save (Windows line endings become plain ones, so
 * a line break always counts as one character), or throws an Error whose
 * message can be shown to the owner.
 */
export function checkPersonaText(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected text.");
  const text = value.replace(/\r\n/g, "\n");
  if (text.includes("\u0000")) throw new Error("The personality contains a character that can't be saved.");
  if (text.trim() === "") throw new Error("Write something, or use Reset to starter.");
  if (text.length > PERSONA_LIMIT) throw new Error("The personality can be at most 4,000 characters.");
  return text;
}
