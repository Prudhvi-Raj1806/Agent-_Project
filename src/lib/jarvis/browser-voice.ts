/**
 * The browser's built-in voice is only used when no server voice can speak, but
 * Veda is female-only, so even that fallback prefers a female voice instead of
 * whatever the system default is (often male, e.g. Windows' David).
 */

export interface VoiceLike {
  name: string;
  lang: string;
}

const FEMALE_NAME =
  /\b(female|woman|zira|aria|jenny|libby|sonia|natasha|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|joanna|salli|kendra|kimberly|ivy|emma|amy|ava|allison|michelle|heera|hedda|katja|denise|eva|elsa)\b/i;
const MALE_NAME =
  /\b(male|david|mark|george|james|guy|ryan|daniel|fred|tom|alex|richard|brian|eric|christopher|roger|steffan|thomas|oliver|ravi|stefan)\b/i;

/** The first female-sounding voice in the given language, or undefined to leave the browser's default. */
export function pickFemaleVoice<T extends VoiceLike>(voices: readonly T[], language = "en"): T | undefined {
  return voices.find(
    (voice) => voice.lang.toLowerCase().startsWith(language) && FEMALE_NAME.test(voice.name) && !MALE_NAME.test(voice.name),
  );
}

/** Gives an utterance the preferred female voice, when the browser has one. */
export function applyFemaleVoice(utterance: SpeechSynthesisUtterance): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const voice = pickFemaleVoice(window.speechSynthesis.getVoices());
  if (voice) utterance.voice = voice;
}

/** Speaks a line with the browser's built-in voice (female when available). */
export function speakInBrowser(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  applyFemaleVoice(utterance);
  window.speechSynthesis.speak(utterance);
}
