export type Verdict = "PASS" | "FAIL" | "UNCERTAIN";

export interface VerificationResult {
  verdict: Verdict;
  reasons: string[];
  checkedAt: string;
}
