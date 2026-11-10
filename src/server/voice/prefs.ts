import { getSetting } from "@/server/settings/store";
import { envVoicePrefs, type VoicePrefs } from "./tts";

/**
 * The owner's voice choice from the settings store. A database that can't be
 * read must not make the assistant mute, so that case falls back to the
 * automatic order and the environment's voice.
 */
export function currentVoicePrefs(): VoicePrefs {
  try {
    return { provider: getSetting("voice.provider"), voice: getSetting("voice.voicestudioVoice") };
  } catch {
    return envVoicePrefs();
  }
}
