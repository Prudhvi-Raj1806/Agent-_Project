/**
 * The registry of settings the dashboard can store. Every key has a default
 * and a `parse` that throws on invalid input, so nothing arbitrary can reach
 * the database. Add new keys here; no migration is needed because absent keys
 * fall back to their default.
 */

export interface SettingsShape {
  "remote.enabled": boolean;
  "remote.allowedLogins": string[];
  "remote.tailnetHost": string;
  "voice.provider": VoiceProvider;
  "voice.voicestudioVoice": string;
  "voice.kokoroVoice": string;
  "voice.autoSendDictation": boolean;
  "voice.replyDevice": ReplyDevice;
}

export const VOICE_PROVIDERS = ["auto", "kokoro", "voicestudio", "elevenlabs", "browser"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

export const REPLY_DEVICES = ["this-device", "pc"] as const;
export type ReplyDevice = (typeof REPLY_DEVICES)[number];

export type SettingKey = keyof SettingsShape;

interface SettingDef<T> {
  /** May be a getter, for defaults that follow an environment variable. */
  readonly default: T;
  /** Returns the cleaned value, or throws an Error describing what's wrong. */
  parse(value: unknown): T;
}

const MAX_LOGINS = 5;
const MAX_LOGIN_LENGTH = 200;
const DNS_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function parseBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Expected true or false.");
  return value;
}

function parseLogins(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Expected a list of logins.");
  const cleaned: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") throw new Error("Each login must be text.");
    const login = item.trim().toLowerCase();
    if (!login || /\s/.test(login)) throw new Error("A login can't be empty or contain spaces.");
    if (login.length > MAX_LOGIN_LENGTH) throw new Error("A login is too long.");
    if (!cleaned.includes(login)) cleaned.push(login);
  }
  if (cleaned.length > MAX_LOGINS) throw new Error(`At most ${MAX_LOGINS} logins are allowed.`);
  return cleaned;
}

function parseTailnetHost(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected text.");
  const host = value.trim().toLowerCase();
  if (host === "") return "";
  if (host.length > 253 || !DNS_NAME.test(host)) throw new Error("Expected a DNS name like pc.tail1234.ts.net.");
  return host;
}

function parseOneOf<T extends string>(allowed: readonly T[]) {
  return (value: unknown): T => {
    if (typeof value !== "string" || !allowed.includes(value as T)) {
      throw new Error(`Expected one of: ${allowed.join(", ")}.`);
    }
    return value as T;
  };
}

/** A Voice Studio profile id, profile name or preset. Letters, digits, spaces and . _ : - only. */
const VOICE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._:-]{0,63}$/u;
const FALLBACK_VOICE = "alloy";

function parseVoiceName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected text.");
  const voice = value.trim();
  if (!VOICE_NAME.test(voice)) {
    throw new Error("A voice is 1 to 64 letters, digits, spaces or . _ : - characters.");
  }
  return voice;
}

/** A Kokoro voice id: a built-in such as af_heart, or the file name of a custom voice. No dots or slashes, ever. */
const KOKORO_VOICE = /^[a-z][a-z0-9_-]{1,31}$/;
const DEFAULT_KOKORO_VOICE = "af_heart";

function parseKokoroVoice(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected text.");
  const voice = value.trim().toLowerCase();
  if (!KOKORO_VOICE.test(voice)) throw new Error("A Kokoro voice looks like af_heart, bm_george or a custom voice name.");
  return voice;
}

/** `VOICESTUDIO_VOICE` from the environment when it is usable, else "alloy". */
function envVoice(): string {
  const configured = process.env.VOICESTUDIO_VOICE?.trim() ?? "";
  return VOICE_NAME.test(configured) ? configured : FALLBACK_VOICE;
}

export const SETTING_DEFS: { [K in SettingKey]: SettingDef<SettingsShape[K]> } = {
  "remote.enabled": { default: false, parse: parseBoolean },
  "remote.allowedLogins": { default: [], parse: parseLogins },
  "remote.tailnetHost": { default: "", parse: parseTailnetHost },
  "voice.provider": { default: "auto", parse: parseOneOf(VOICE_PROVIDERS) },
  "voice.voicestudioVoice": {
    get default() {
      return envVoice();
    },
    parse: parseVoiceName,
  },
  "voice.kokoroVoice": { default: DEFAULT_KOKORO_VOICE, parse: parseKokoroVoice },
  "voice.autoSendDictation": { default: false, parse: parseBoolean },
  "voice.replyDevice": { default: "this-device", parse: parseOneOf(REPLY_DEVICES) },
};

/** Every setting at its default, for when the database can't be read. */
export function defaultSettings(): SettingsShape {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(SETTING_DEFS) as SettingKey[]) out[key] = SETTING_DEFS[key].default;
  return out as unknown as SettingsShape;
}

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFS, key);
}
