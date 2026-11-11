import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { getAllSettings, getSetting, setSettings } from "./store";

describe("settings store", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("returns defaults when nothing is stored", () => {
    expect(getAllSettings()).toEqual({
      "persona.name": "Veda",
      "persona.ownerName": "Raj",
      "brain.enabled": true,
      "brain.model": "phi4-mini",
      "remote.enabled": false,
      "remote.allowedLogins": [],
      "remote.tailnetHost": "",
      "voice.provider": "auto",
      "voice.voicestudioVoice": "alloy",
      "voice.kokoroVoice": "af_heart",
      "voice.autoSendDictation": false,
      "voice.replyDevice": "this-device",
    });
  });

  it("round-trips a partial update and leaves other keys at their defaults", () => {
    setSettings({ "remote.enabled": true });
    expect(getSetting("remote.enabled")).toBe(true);
    expect(getSetting("remote.allowedLogins")).toEqual([]);
  });

  it("rejects an unknown key and stores nothing", () => {
    expect(() => setSettings({ nope: 1 } as never)).toThrow(/unknown/i);
    expect(getAllSettings()["remote.enabled"]).toBe(false);
  });

  it("is all-or-nothing when one value in a batch is invalid", () => {
    expect(() =>
      setSettings({ "remote.enabled": true, "remote.allowedLogins": "x" as never }),
    ).toThrow();
    expect(getSetting("remote.enabled")).toBe(false);
  });

  it("trims, lower-cases, de-duplicates and caps logins at 5", () => {
    setSettings({ "remote.allowedLogins": [" A@x.com ", "a@x.com", "b@x.com"] });
    expect(getSetting("remote.allowedLogins")).toEqual(["a@x.com", "b@x.com"]);
    expect(() =>
      setSettings({ "remote.allowedLogins": ["1@x", "2@x", "3@x", "4@x", "5@x", "6@x"] }),
    ).toThrow();
  });

  it("rejects a login with a space inside or over 200 characters", () => {
    expect(() => setSettings({ "remote.allowedLogins": ["a b@x.com"] })).toThrow();
    expect(() => setSettings({ "remote.allowedLogins": ["a".repeat(201)] })).toThrow();
  });

  it("accepts only a DNS name or empty for tailnetHost", () => {
    setSettings({ "remote.tailnetHost": "pc.tail1234.ts.net" });
    expect(getSetting("remote.tailnetHost")).toBe("pc.tail1234.ts.net");
    setSettings({ "remote.tailnetHost": "" });
    expect(getSetting("remote.tailnetHost")).toBe("");
    expect(() => setSettings({ "remote.tailnetHost": "evil.com/x" })).toThrow();
    expect(() => setSettings({ "remote.tailnetHost": "a b" })).toThrow();
  });

  describe("persona names", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("accepts a name of letters, digits, spaces and . ' - and trims it", () => {
      setSettings({ "persona.name": "  Nova-2  ", "persona.ownerName": "D'Arcy Jr." });
      expect(getSetting("persona.name")).toBe("Nova-2");
      expect(getSetting("persona.ownerName")).toBe("D'Arcy Jr.");
    });

    it.each(["", "   ", "a".repeat(25), "<script>", "../etc", "two\nlines", "-dash first", 7])("refuses the name %j", (bad) => {
      expect(() => setSettings({ "persona.name": bad as never })).toThrow();
      expect(() => setSettings({ "persona.ownerName": bad as never })).toThrow();
      expect(getSetting("persona.name")).toBe("Veda");
    });

    it("takes the owner default from JARVIS_OWNER_NAME, ignoring an unusable value", () => {
      vi.stubEnv("JARVIS_OWNER_NAME", "Prudhvi");
      expect(getSetting("persona.ownerName")).toBe("Prudhvi");
      vi.stubEnv("JARVIS_OWNER_NAME", "<b>x</b>");
      expect(getSetting("persona.ownerName")).toBe("Raj");
    });

    it("a stored owner name wins over JARVIS_OWNER_NAME", () => {
      vi.stubEnv("JARVIS_OWNER_NAME", "Prudhvi");
      setSettings({ "persona.ownerName": "Boss" });
      expect(getSetting("persona.ownerName")).toBe("Boss");
    });
  });

  describe("mini brain settings", () => {
    it("stores the switch as a boolean only", () => {
      setSettings({ "brain.enabled": false });
      expect(getSetting("brain.enabled")).toBe(false);
      expect(() => setSettings({ "brain.enabled": "off" as never })).toThrow();
    });

    it("accepts an Ollama model name, with or without a tag", () => {
      setSettings({ "brain.model": " gemma4:latest " });
      expect(getSetting("brain.model")).toBe("gemma4:latest");
      setSettings({ "brain.model": "hf.co/user/model-q4_k_m" });
      expect(getSetting("brain.model")).toBe("hf.co/user/model-q4_k_m");
    });

    it.each(["", "   ", "Phi4", "a b", "../x", "phi4;rm", "a".repeat(65), 7])("refuses the model name %j", (bad) => {
      expect(() => setSettings({ "brain.model": bad as never })).toThrow();
      expect(getSetting("brain.model")).toBe("phi4-mini");
    });
  });

  describe("voice settings", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("stores a valid provider and reply device, and refuses anything else", () => {
      setSettings({ "voice.provider": "elevenlabs", "voice.replyDevice": "pc" });
      expect(getSetting("voice.provider")).toBe("elevenlabs");
      expect(getSetting("voice.replyDevice")).toBe("pc");
      expect(() => setSettings({ "voice.provider": "siri" as never })).toThrow();
      expect(() => setSettings({ "voice.replyDevice": "tv" as never })).toThrow();
      expect(getSetting("voice.provider")).toBe("elevenlabs");
    });

    it("defaults the Voice Studio voice to VOICESTUDIO_VOICE, and a stored voice wins over it", () => {
      vi.stubEnv("VOICESTUDIO_VOICE", "profile-123");
      expect(getSetting("voice.voicestudioVoice")).toBe("profile-123");
      setSettings({ "voice.voicestudioVoice": "  Morgan Freeman " });
      expect(getSetting("voice.voicestudioVoice")).toBe("Morgan Freeman");
    });

    it("falls back to alloy when VOICESTUDIO_VOICE is unusable", () => {
      vi.stubEnv("VOICESTUDIO_VOICE", "../../etc");
      expect(getSetting("voice.voicestudioVoice")).toBe("alloy");
    });

    it("refuses a voice with unsafe characters, an empty one, or one over 64 characters", () => {
      for (const bad of ["", "   ", "a/b", "x\"y", "<v>", "a".repeat(65), 7]) {
        expect(() => setSettings({ "voice.voicestudioVoice": bad as never })).toThrow();
      }
    });

    it("accepts built-in and custom Kokoro voice names, and refuses anything path-like", () => {
      setSettings({ "voice.kokoroVoice": " BF_Emma " });
      expect(getSetting("voice.kokoroVoice")).toBe("bf_emma");
      setSettings({ "voice.kokoroVoice": "friday" });
      expect(getSetting("voice.kokoroVoice")).toBe("friday");
      for (const bad of ["", "a", "../../x", "a/b", "c:\\\\x", "friday.pt", "Friday!", "x".repeat(33), 7]) {
        expect(() => setSettings({ "voice.kokoroVoice": bad as never })).toThrow();
      }
      expect(getSetting("voice.kokoroVoice")).toBe("friday");
    });

    it("is female-only: refuses every built-in male Kokoro voice and keeps a female default", () => {
      expect(getSetting("voice.kokoroVoice")).toBe("af_heart");
      for (const male of ["am_adam", "bm_george", "em_alex", "hm_psi", "im_nicola", "jm_kumo", "pm_alex", "zm_yunxi", "AM_ECHO"]) {
        expect(() => setSettings({ "voice.kokoroVoice": male })).toThrow(/female/i);
      }
      expect(getSetting("voice.kokoroVoice")).toBe("af_heart");
      setSettings({ "voice.kokoroVoice": "zf_xiaoxiao" });
      expect(getSetting("voice.kokoroVoice")).toBe("zf_xiaoxiao");
    });

    it("stores the auto-send switch as a boolean only", () => {
      setSettings({ "voice.autoSendDictation": true });
      expect(getSetting("voice.autoSendDictation")).toBe(true);
      expect(() => setSettings({ "voice.autoSendDictation": "yes" as never })).toThrow();
    });
  });
});
