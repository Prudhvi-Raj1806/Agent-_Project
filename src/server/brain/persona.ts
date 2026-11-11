import { starterPersona } from "@/lib/persona";
import { loadPersona } from "@/server/hermes/persona";
import { getBrand, getOwnerName } from "@/server/settings/brand";

/**
 * Hermes's personality is used by the mini brain too, but only while it is
 * short: on this PC every extra thousand characters of prompt adds seconds to
 * each answer. A longer one falls back to the short starter.
 */
export const PERSONA_SOUL_LIMIT = 1500;

export interface ResolvedPersona {
  text: string;
  /** "soul" when it is Hermes's own SOUL.md, "starter" when it is the built-in short one. */
  source: "soul" | "starter";
}

export async function resolvePersona(): Promise<ResolvedPersona> {
  const starter: ResolvedPersona = { text: starterPersona(getBrand(), getOwnerName()), source: "starter" };
  let soul: string;
  try {
    soul = (await loadPersona()).text;
  } catch {
    return starter;
  }
  if (soul.trim() === "" || soul.length > PERSONA_SOUL_LIMIT) return starter;
  return { text: soul, source: "soul" };
}
