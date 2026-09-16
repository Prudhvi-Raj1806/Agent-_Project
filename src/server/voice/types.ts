export interface VoiceVerifyResult {
  ok: boolean;
  /** Short-lived, single-use token proving verification, when ok. */
  token?: string;
  reason?: string;
}

/**
 * The one boundary risky actions should ever verify identity/consent
 * through. `SpokenPasscodeVerifier` (passcode.ts) is the Phase 1
 * implementation — a spoken PIN, not identity proof. A future
 * `VoiceBiometricVerifier` (speaker-identity verification against an
 * enrolled voice profile, via a real biometric provider) can implement the
 * same interface and swap in via `factory.ts` without touching callers.
 */
export interface VoiceVerifier {
  readonly mode: "spoken-passcode" | "biometric";
  verify(input: { transcript: string }): VoiceVerifyResult;
}
