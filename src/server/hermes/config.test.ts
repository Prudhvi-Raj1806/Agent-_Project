import { describe, expect, it } from "vitest";
import { applyModelChoice, readModelChoices, readModelSelection } from "./config";

const crlf = (s: string) => s.replace(/\n/g, "\r\n");

const SAMPLE = crlf(`model:
  base_url: https://generativelanguage.googleapis.com/v1beta
  default: gemini-flash-latest
  provider: gemini
providers:
  ollama-launch:
    api: http://127.0.0.1:11434/v1
    default_model: phi4-mini
    models:
      - phi4-mini
      - phi4-mini:latest
      - qwen3.5:latest
    name: Ollama
  omniroute:
    # a comment that must survive
    api: http://127.0.0.1:20128/v1
    key_env: OMNIROUTE_API_KEY
    default_model: antigravity/gemini-3-flash
    models:
      - antigravity/gemini-3-flash
    name: OmniRoute
toolsets:
  - hermes-cli
`);

describe("readModelSelection", () => {
  it("reads the provider and model Hermes is currently set to", () => {
    expect(readModelSelection(SAMPLE)).toEqual({ provider: "gemini", model: "gemini-flash-latest" });
  });

  it("returns null when there is no model block", () => {
    expect(readModelSelection("toolsets:\n  - web\n")).toBeNull();
  });
});

describe("readModelChoices", () => {
  it("lists the configured providers with their models, plus the built-in Gemini models", () => {
    const choices = readModelChoices(SAMPLE);
    const ollama = choices.find((c) => c.provider === "ollama-launch");
    expect(ollama?.label).toBe("Ollama");
    expect(ollama?.models).toEqual(["phi4-mini", "phi4-mini:latest", "qwen3.5:latest"]);
    expect(choices.find((c) => c.provider === "omniroute")?.models).toEqual(["antigravity/gemini-3-flash"]);
    const gemini = choices.find((c) => c.provider === "gemini");
    expect(gemini?.models).toContain("gemini-2.5-flash");
  });
});

describe("applyModelChoice", () => {
  it("switches to a named local provider and drops the Gemini base_url", () => {
    const out = applyModelChoice(SAMPLE, { provider: "ollama-launch", model: "phi4-mini:latest" });
    expect(readModelSelection(out)).toEqual({ provider: "ollama-launch", model: "phi4-mini:latest" });
    expect(out).not.toMatch(/generativelanguage/);
  });

  it("switches back to Gemini and restores its base_url", () => {
    const local = applyModelChoice(SAMPLE, { provider: "ollama-launch", model: "qwen3.5:latest" });
    const back = applyModelChoice(local, { provider: "gemini", model: "gemini-2.5-flash" });
    expect(readModelSelection(back)).toEqual({ provider: "gemini", model: "gemini-2.5-flash" });
    expect(back).toMatch(/base_url: https:\/\/generativelanguage\.googleapis\.com\/v1beta/);
  });

  it("changes nothing outside the model block, including comments and line endings", () => {
    const out = applyModelChoice(SAMPLE, { provider: "ollama-launch", model: "phi4-mini" });
    const tail = (s: string) => s.slice(s.indexOf("providers:"));
    expect(tail(out)).toBe(tail(SAMPLE));
    expect(out.includes("\r\n")).toBe(true);
    expect(/(^|[^\r])\n/.test(out)).toBe(false);
  });

  it("keeps LF files LF", () => {
    const lf = SAMPLE.replace(/\r\n/g, "\n");
    const out = applyModelChoice(lf, { provider: "ollama-launch", model: "phi4-mini" });
    expect(out.includes("\r")).toBe(false);
  });

  it("keeps unrelated keys inside the model block", () => {
    const withExtra = SAMPLE.replace("  provider: gemini", "  provider: gemini\r\n  context_length: 32000");
    const out = applyModelChoice(withExtra, { provider: "ollama-launch", model: "phi4-mini" });
    expect(out).toMatch(/context_length: 32000/);
  });

  it("rejects a provider or model that Hermes isn't configured for", () => {
    expect(() => applyModelChoice(SAMPLE, { provider: "nope", model: "x" })).toThrow(/provider/i);
    expect(() => applyModelChoice(SAMPLE, { provider: "ollama-launch", model: "llama-405b" })).toThrow(/model/i);
  });

  it("rejects values that could inject extra YAML", () => {
    expect(() => applyModelChoice(SAMPLE, { provider: "gemini", model: "gemini-2.5-flash\nprovider: evil" })).toThrow();
  });
});
