import crypto from "node:crypto";
import { logger } from "@/server/logging/logger";
import type { VoiceVerifier, VoiceVerifyResult } from "./types";

const TOKEN_TTL_MS = 60_000;

/** Single-use, short-lived tokens proving a risky action was just verified. In-memory — fine for one local dev process. */
const tokens = new Map<string, number>();

function normalize(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

function issueToken(): string {
  const token = crypto.randomUUID();
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

/**
 * Phase 1 verifier: you speak a passcode phrase, the browser transcribes it,
 * this compares the text against a passcode you set via env var. This
 * proves you know the phrase and can speak it — NOT that it's specifically
 * your voice. Anyone who knows the phrase (or plays a recording of it)
 * passes. Real speaker-identity verification is a future `VoiceVerifier`
 * implementation, not this one.
 */
export class SpokenPasscodeVerifier implements VoiceVerifier {
  readonly mode = "spoken-passcode" as const;

  verify({ transcript }: { transcript: string }): VoiceVerifyResult {
    const configured = process.env.JARVIS_VOICE_PASSCODE;
    if (!configured) {
      return { ok: false, reason: "No voice passcode is configured (set JARVIS_VOICE_PASSCODE)." };
    }
    if (normalize(transcript) !== normalize(configured)) {
      return { ok: false, reason: "Passcode didn't match." };
    }
    return { ok: true, token: issueToken() };
  }
}

export function getVoiceVerifier(): VoiceVerifier {
  return new SpokenPasscodeVerifier();
}

export function isVoicePasscodeConfigured(): boolean {
  return Boolean(process.env.JARVIS_VOICE_PASSCODE);
}

/** One-time use — consuming a token invalidates it immediately. */
export function consumeVerificationToken(token: string | null): boolean {
  if (!token) return false;
  const expiry = tokens.get(token);
  if (!expiry) return false;
  tokens.delete(token);
  const valid = Date.now() < expiry;
  if (!valid) logger.warn("voice.token.expired", {});
  return valid;
}
