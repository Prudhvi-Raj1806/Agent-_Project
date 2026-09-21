/** Structured, secret-redacting logging for backend operations. */

const SECRET_KEY_PATTERN = /key|token|secret|password|authoriz/i;

/**
 * Environment variables known to hold real secret material (Sprint 04
 * Section 12 — the previous audit found redaction was field-name-based
 * only, so a secret logged under an innocuously-named field, or embedded in
 * a larger string like an error message, would pass through unredacted).
 * This is a second, independent redaction pass: it doesn't matter what key
 * a value is logged under, or whether it's the whole string or a substring
 * of one — if it equals a real, currently-configured secret value, it's
 * redacted. Deliberately a fixed, known list (every secret-shaped env var
 * this codebase actually reads — see .env.example) rather than a generic
 * "any env var" scan, which would be both slower and prone to redacting
 * ordinary non-secret config by accident.
 */
const SECRET_ENV_VAR_NAMES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "OMNIROUTE_API_KEY",
  "HERMES_AGENT_API_KEY",
  "ELEVENLABS_API_KEY",
  "JARVIS_VOICE_PASSCODE",
  "SPOTIFY_CLIENT_SECRET",
] as const;

/** Re-read live each call (not cached at module load) so `vi.stubEnv` in tests, and any runtime env change, are honored immediately. Values under 8 chars are skipped — too short to meaningfully identify as a secret, and more likely to cause false-positive redactions of ordinary short strings. */
function knownSecretValues(): string[] {
  const values: string[] = [];
  for (const name of SECRET_ENV_VAR_NAMES) {
    const value = process.env[name];
    if (value && value.length >= 8) values.push(value);
  }
  return values;
}

function redactValueOccurrences(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (result.includes(secret)) {
      result = result.split(secret).join("[redacted]");
    }
  }
  return result;
}

function redact(value: unknown, secrets: string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => redact(v, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redact(v, secrets),
      ])
    );
  }
  if (typeof value === "string" && secrets.length > 0) {
    return redactValueOccurrences(value, secrets);
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function write(level: Level, operation: string, fields: Fields): void {
  const secrets = knownSecretValues();
  const line = JSON.stringify({
    level,
    operation,
    timestamp: new Date().toISOString(),
    ...(redact(fields, secrets) as Fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (operation: string, fields: Fields = {}) => write("debug", operation, fields),
  info: (operation: string, fields: Fields = {}) => write("info", operation, fields),
  warn: (operation: string, fields: Fields = {}) => write("warn", operation, fields),
  error: (operation: string, fields: Fields = {}) => write("error", operation, fields),
};
