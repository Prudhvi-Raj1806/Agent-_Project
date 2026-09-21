import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sprint 04 Section 16 — the regression test for the original Production
 * Sprint 02 bypass, generalized so it catches ANY future regression, not
 * just the one specific call site that was fixed.
 *
 * The invariant this protects (JARVIS_MASTER_MEMORY.md, standing invariant
 * #12): `src/server/tools/executor.ts`'s `evaluateGovernedToolCall` is the
 * ONLY place in application code allowed to call
 * `security/tool-policy.ts`'s `evaluateToolRequest` directly. Before
 * Production Sprint 02, `missions/orchestrator.ts` had its own independent
 * direct call to it — a second, ungoverned-audit path next to Quick
 * Actions'. `missions/tool-request-boundary.test.ts` proves this
 * behaviorally for `orchestrator.ts` specifically (mocking `tools/executor`
 * and asserting the real `evaluateToolRequest` is never invoked through
 * that one file's code path). This test proves the same property
 * structurally, repo-wide: it doesn't matter which file might one day add a
 * second direct import — including a brand-new module nobody has written
 * yet — this test fails the moment one does.
 *
 * A structural (source-scanning) test, not a behavioral one, is the right
 * tool here specifically because the property under test is "there is no
 * OTHER caller anywhere" — mocking or spying on one specific module can
 * only ever prove that module doesn't call something; it can't prove
 * nothing else in the repository does either. Per this sprint's own
 * instruction (Section 16): "Only use structural/source inspection if
 * there is genuinely no better test" — this is that case.
 */

const SRC_ROOT = path.join(process.cwd(), "src");
const TOOL_POLICY_MODULE_SUFFIX = path.normalize("server/security/tool-policy");

/**
 * Non-test application files allowed to import `evaluateToolRequest`
 * directly, beyond the one governed gate itself.
 *
 * `tools/registry.ts` is the one deliberate exception, not an oversight:
 * it calls `evaluateToolRequest` once, at module load, purely to *read* a
 * tool's `risk` classification for the Tool Registry's own metadata
 * (`risk: evaluateToolRequest(...).risk` — see that file's own comment) so
 * the registry and the policy table can't drift into two independently
 * maintained sources of truth for the same fact (Section 14). It never
 * makes or acts on an ALLOW/ASK/DENY verdict, never executes a tool as a
 * result, and never bypasses `tools/executor.ts` — the actual gate for
 * every real invocation still runs through `evaluateGovernedToolCall`.
 */
const ALLOWED_APPLICATION_IMPORTERS = new Set([
  path.normalize("src/server/tools/executor.ts"), // the one governed gate call site
  path.normalize("src/server/tools/registry.ts"), // metadata-only, see comment above — never gates execution
]);

function listTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Matches any import/require of the tool-policy module, from any relative or `@/`-aliased path, importing `evaluateToolRequest` by name. */
const IMPORT_PATTERN = /import\s*\{[^}]*\bevaluateToolRequest\b[^}]*\}\s*from\s*["'][^"']*security\/tool-policy["']/;

describe("evaluateToolRequest — single governed call site (structural, repo-wide)", () => {
  it("is imported by name only from tools/executor.ts (gate), tools/registry.ts (metadata-only), or test files", () => {
    const offenders: string[] = [];

    for (const absPath of listTsFiles(SRC_ROOT)) {
      const relPath = path.normalize(path.relative(process.cwd(), absPath));
      const content = fs.readFileSync(absPath, "utf-8");

      if (!IMPORT_PATTERN.test(content)) continue;
      // Test files legitimately import the real function to wrap it in a
      // vi.mock spy/assert against it — that's verification, not a second
      // gate. Only non-test application code is under this invariant.
      if (relPath.endsWith(".test.ts") || relPath.endsWith(".test.tsx")) continue;
      if (ALLOWED_APPLICATION_IMPORTERS.has(relPath)) continue;
      // tool-policy.ts itself defines the function — not an "import" of it.
      if (relPath.endsWith(path.normalize(`${TOOL_POLICY_MODULE_SUFFIX}.ts`))) continue;

      offenders.push(relPath);
    }

    expect(offenders).toEqual([]);
  });

  it("sanity check: the pattern actually matches a real import (so a silent regex typo can't make the test above vacuously pass)", () => {
    const executorSource = fs.readFileSync(path.join(SRC_ROOT, "server/tools/executor.ts"), "utf-8");
    expect(IMPORT_PATTERN.test(executorSource)).toBe(true);
  });
});
