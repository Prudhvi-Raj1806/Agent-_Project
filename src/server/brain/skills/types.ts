import type { SystemStatus } from "@/lib/data/types";

/**
 * One thing the mini brain can do by itself. Skills take no arguments and
 * build their reply in code from real data, so a fact is never invented by
 * the model. A skill reports failure as `ok: false` with a sentence the
 * owner can hear; it does not throw.
 */
export interface BrainSkill {
  /** e.g. "music.pause". Shown to the router as one of the allowed choices. */
  id: string;
  /** One line, shown to the router. */
  description: string;
  /** 2 to 4 phrases, shown to the router. */
  examples: string[];
  needsInternet: boolean;
  run(): Promise<{ ok: boolean; reply: string }>;
}

/** Where skills get their data. Injected, so every skill is testable without the real services. */
export interface SkillSources {
  now(): Date;
  system(): Promise<SystemStatus>;
}
