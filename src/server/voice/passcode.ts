import crypto from "node:crypto";
import { logger } from "@/server/logging/logger";
import { clearVoicePasscodeHash, getVoicePasscodeHash, saveVoicePasscodeHash } from "./repository";
import type { VoiceVerifier, VoiceVerifyResult } from "./types";

const TOKEN_TTL_MS = 60_000;
const SCRYPT_KEYLEN = 64;

/** Single-use, short-lived tokens proving a risky action was just verified. In-memory — fine for one local dev process. */
const tokens = new Map<string, number>();

function normalize(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

function hashPhrase(phrase: string, salt: string): string {
  return crypto.scryptSync(normalize(phrase), salt, SCRYPT_KEYLEN).toString("hex");
}

function issueToken(): string {
  const token = crypto.randomUUID();
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

/**
 * Phase 1 verifier: you speak a passcode phrase, the browser transcribes it,
 * this compares the text against a passcode you set (from Settings, or
 * JARVIS_VOICE_PASSCODE as a bootstrap fallback). This proves you know the
 * phrase and can speak it — NOT that it's specifically your voice. Anyone
 * who knows the phrase (or plays a recording of it) passes. Real
 * speaker-identity verification is a future `VoiceVerifier` implementation,
 * not this one.
 */
export class SpokenPasscodeVerifier implements VoiceVerifier {
  readonly mode = "spoken-passcode" as const;

  verify({ transcript }: { transcript: string }): VoiceVerifyResult {
    const stored = getVoicePasscodeHash();
    if (stored) {
      if (hashPhrase(transcript, stored.salt) !== stored.hash) {
        return { ok: false, reason: "Passcode didn't match." };
      }
      return { ok: true, token: issueToken() };
    }

    const configured = process.env.JARVIS_VOICE_PASSCODE;
    if (!configured) {
      return { ok: false, reason: "No voice passcode is configured — set one in Settings." };
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
  return getVoicePasscodeHash() !== null || Boolean(process.env.JARVIS_VOICE_PASSCODE);
}

/** Which source is actually gating risky actions right now — for an honest Settings display. */
export function getVoicePasscodeSource(): "settings" | "env" | "none" {
  if (getVoicePasscodeHash()) return "settings";
  if (process.env.JARVIS_VOICE_PASSCODE) return "env";
  return "none";
}

/** Sets/replaces the passcode from the Settings page — always hashed, never stored in plaintext. */
export function setVoicePasscode(phrase: string): void {
  const salt = crypto.randomBytes(16).toString("hex");
  saveVoicePasscodeHash(hashPhrase(phrase, salt), salt);
}

/** Removes the DB-stored passcode. If JARVIS_VOICE_PASSCODE is still set, that becomes active again. */
export function clearVoicePasscode(): void {
  clearVoicePasscodeHash();
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
