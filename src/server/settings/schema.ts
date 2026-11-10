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
}

export type SettingKey = keyof SettingsShape;

interface SettingDef<T> {
  default: T;
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

export const SETTING_DEFS: { [K in SettingKey]: SettingDef<SettingsShape[K]> } = {
  "remote.enabled": { default: false, parse: parseBoolean },
  "remote.allowedLogins": { default: [], parse: parseLogins },
  "remote.tailnetHost": { default: "", parse: parseTailnetHost },
};

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFS, key);
}
