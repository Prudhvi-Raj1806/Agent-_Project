/** Structured, secret-redacting logging for backend operations. */

const SECRET_KEY_PATTERN = /key|token|secret|password|authoriz/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redact(v),
      ])
    );
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function write(level: Level, operation: string, fields: Fields): void {
  const line = JSON.stringify({
    level,
    operation,
    timestamp: new Date().toISOString(),
    ...(redact(fields) as Fields),
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
