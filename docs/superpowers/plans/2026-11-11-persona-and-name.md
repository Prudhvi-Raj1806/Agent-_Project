# Persona and Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can rename the assistant, set their own name, and edit Hermes's personality from the Settings page, and every screen, the page title, the spoken greeting and the Spotify device follow.

**Architecture:** Two new keys in the existing settings registry (`persona.name`, `persona.ownerName`) replace the static `BRAND` and the hardcoded "Raj" through `useBrand()` / `useOwnerName()` on the client and `getBrand()` / `getOwnerName()` on the server. The personality is Hermes's own `{HERMES_HOME}/SOUL.md`; the file is the source of truth, read and written through one route that backs up before each save and writes atomically.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, `node:sqlite`, Tailwind 4, vitest 3.

**Spec:** `docs/superpowers/specs/2026-11-10-settings-dashboard-design.md`, section 3 "Persona and name" (plus the two `persona.*` rows of the key table in section 1, and the Security section). This is step 5 of the spec's build order.

## Global Constraints

- Read `node_modules/next/dist/docs/` before writing Next-specific code. `generateMetadata` cannot be exported alongside a `metadata` object in the same file.
- Run `npx tsc --noEmit`, `npx eslint` and `npx vitest run` before every commit; all must pass.
- Commit messages carry **no** `Co-authored-by` trailer of any kind (user rule); author is the existing git identity.
- Stage files by path (`git add <paths>`), never `git add -A`.
- `persona.name`: string, 1 to 24 chars, default `BRAND` from `lib/brand.ts` ("Veda").
- `persona.ownerName`: string, 1 to 24 chars, default `JARVIS_OWNER_NAME` or "Raj". A stored setting wins over the env default.
- Personality text: length limit 4,000 characters.
- Settings strings use character allow-lists. No request data reaches a shell string or a file path; the only file this plan writes is `{HERMES_HOME}/SOUL.md`.
- File writes back up first and write atomically.
- `lib/brand.ts` keeps the default and stays as it is.
- UI work follows the existing settings panels (`voice-panel.tsx` for field, button and status styles) and the `/impeccable` skill; no new visual language.
- Vitest includes only `src/server/**`, `src/lib/**` and `src/app/**/*.test.ts`. Tests use `resetDbForTests(":memory:")` from `@/server/db/client`.

## Review Focus

1. **The existing `SOUL.md` is already longer than 4,000 characters** (edited outside the dashboard): it must load in full, never be truncated on read, and Save stays disabled until it is under the limit.
2. **Hermes is not installed** (`{HERMES_HOME}` does not exist): the panel says so and a save writes nothing; it must not create the folder.
3. **`SOUL.md` does not exist yet** but Hermes does: load returns empty text, and the first save creates the file with no backup and no error.
4. **Renaming does not rewrite the personality**: after changing the name, the old name is still in `SOUL.md`. The panel says so when the text does not mention the current name.
5. **A name made of unsafe characters** (`<script>`, a path, a newline, 25 characters, only spaces) is refused with a 400 and nothing is stored, and a bad `JARVIS_OWNER_NAME` in the environment falls back to "Raj" instead of becoming the default.

---

### Task 0: Commit the work already in the tree

`schema.ts` and `store.test.ts` carry uncommitted female-only voice changes, so Task 1 cannot commit cleanly until they land.

- [ ] **Step 1:** Run `npx tsc --noEmit && npx eslint && npx vitest run` → all pass.
- [ ] **Step 2:** Commit in three parts, staging by path:
  - `feat: female-only voices across Kokoro, PC speaker and browser fallback` (`services/kokoro/server.py`, `src/server/settings/schema.ts`, `src/server/settings/store.test.ts`, `src/server/voice/pc-playback.ts`, `src/server/voice/pc-playback.test.ts`, `src/server/voice/tts.test.ts`, `src/lib/jarvis/browser-voice.ts`, `src/lib/jarvis/browser-voice.test.ts`, `src/lib/jarvis/use-jarvis-voice.ts`, `src/lib/clap/clap-detector-context.tsx`, `src/components/settings/voice-panel.tsx`)
  - `fix: let public images through the access gate` (`src/proxy.ts`, `src/server/access/proxy.test.ts`)
  - `feat: desktop launcher and lint ignore for the Kokoro venv` (`launcher/`, `package.json`, `eslint.config.mjs`)

---

### Task 1: Name settings and how the app reads them

**Files:**
- Modify: `src/server/settings/schema.ts`, `src/server/settings/store.test.ts`, `src/app/api/app-settings/route.test.ts`
- Create: `src/server/settings/brand.ts`, `src/server/settings/brand.test.ts`, `src/lib/settings/use-brand.ts`

**Interfaces:**
- Produces: `SettingsShape["persona.name"]: string`, `SettingsShape["persona.ownerName"]: string`; `getBrand(): string` and `getOwnerName(): string` from `@/server/settings/brand`; `useBrand(): string` and `useOwnerName(): string` from `@/lib/settings/use-brand`.

- [ ] **Step 1: Write the failing tests**

In `store.test.ts`, add both keys to the defaults expectation (`"persona.name": "Veda"`, `"persona.ownerName": "Raj"`) and add:

```ts
it("accepts a name of letters, digits, spaces and . ' - and trims it", () => {
  setSettings({ "persona.name": "  Nova-2  ", "persona.ownerName": "D'Arcy Jr." });
  expect(getSetting("persona.name")).toBe("Nova-2");
  expect(getSetting("persona.ownerName")).toBe("D'Arcy Jr.");
});

it.each(["", "   ", "a".repeat(25), "<script>", "../etc", "two\nlines", "-dash first"])("refuses the name %j", (bad) => {
  expect(() => setSettings({ "persona.name": bad })).toThrow();
  expect(() => setSettings({ "persona.ownerName": bad })).toThrow();
  expect(getSetting("persona.name")).toBe("Veda");
});

it("takes the owner default from JARVIS_OWNER_NAME, ignoring an unusable value", () => {
  vi.stubEnv("JARVIS_OWNER_NAME", "Prudhvi");
  expect(getSetting("persona.ownerName")).toBe("Prudhvi");
  vi.stubEnv("JARVIS_OWNER_NAME", "<b>x</b>");
  expect(getSetting("persona.ownerName")).toBe("Raj");
});
```

Add both keys to the defaults expectation in `route.test.ts`, plus: `put({ "persona.name": "<script>" })` → 400, and `put({ "persona.name": "Nova" }, "tailscale")` → 200 (names are not `remote.*`, so the phone may change them).

`brand.test.ts`: `getBrand()` is "Veda" and `getOwnerName()` is "Raj" on a fresh database; both follow `setSettings`; both return the defaults when `getDb` throws (mock `@/server/db/client`).

- [ ] **Step 2:** Run `npx vitest run src/server/settings src/app/api/app-settings` → new tests FAIL.
- [ ] **Step 3: Add the keys to `schema.ts`.** `parsePersonName(value: unknown): string` trims and tests against `/^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,23}$/u`; error text "A name is 1 to 24 letters, digits, spaces or . ' - characters." `persona.name` defaults to `BRAND`; `persona.ownerName` uses a getter that returns `JARVIS_OWNER_NAME` when it passes the same pattern, else "Raj".
- [ ] **Step 4: Write `brand.ts`** (`getBrand`, `getOwnerName`: `getSetting` in a try/catch that falls back to the registry default) **and `use-brand.ts`** (`"use client"`; both hooks read `useAppSettings().settings`).
- [ ] **Step 5:** Run `npx vitest run` → all pass. Run `npx tsc --noEmit && npx eslint`.
- [ ] **Step 6: Commit** `feat: add assistant name and owner name settings`.

---

### Task 2: Use the names everywhere

**Files:**
- Modify (server, `getBrand()` / `getOwnerName()`): `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/calendar/page.tsx`, `src/app/focus/page.tsx`, `src/app/ima/page.tsx`, `src/app/music/page.tsx`, `src/app/system/page.tsx`, `src/app/work/page.tsx`, `src/app/settings/page.tsx`, `src/server/actions/registry.ts`, `src/server/security/policy.ts`
- Modify (client, `useBrand()` / `useOwnerName()`): `src/components/calendar/add-event-form.tsx`, `src/components/jarvis/jarvis-globe.tsx`, `src/components/jarvis/jarvis-screen.tsx`, `src/components/music/music-view.tsx`, `src/components/primitives/command-bar.tsx`, `src/components/settings/spotify-connection-row.tsx`, `src/components/settings/voice-passcode-panel.tsx`, `src/components/shell/sidebar.tsx`, `src/components/work/active-missions-panel.tsx`, `src/lib/actions/use-run-action.ts`, `src/lib/spotify/player-context.tsx`, `src/lib/spotify/use-spotify-player.ts`, `src/lib/clap/clap-detector-context.tsx`
- Modify: `src/lib/jarvis/briefing.ts`, `src/lib/jarvis/briefing.test.ts`

**Interfaces:**
- Consumes: Task 1's four functions.
- Produces: `BriefingInput.ownerName: string`; `SpotifyPlayerContext` value gains `deviceName: string | null` (the name the player registered with).

- [ ] **Step 1: Write the failing test.** In `briefing.test.ts`, pass `ownerName: "Prudhvi"` and assert the text starts with `"Good evening, Prudhvi. Systems online."`; update the existing calls to pass `ownerName: "Raj"`.
- [ ] **Step 2:** Run `npx vitest run src/lib/jarvis/briefing.test.ts` → FAIL.
- [ ] **Step 3: Thread the owner name through the greetings.** `buildBriefing` takes `ownerName` from its input; `jarvis-screen.tsx` passes `useOwnerName()`. The clap greeting in `clap-detector-context.tsx` takes the owner name the same way.
- [ ] **Step 4: Replace every `BRAND` import outside `lib/brand.ts`, `schema.ts` and `sidebar.tsx`'s default check, and every hardcoded "Raj".** Server files call the getters inside the component or function body; client files call the hooks. Specifics the call sites do not decide:
  - `layout.tsx`: replace the `metadata` object with `export function generateMetadata(): Metadata` returning `{ title: getBrand(), description: "Personal AI operating environment" }`.
  - `sidebar.tsx`: build `primaryNav` inside the component so the label follows the name. Show the `veda-wordmark.png` image only while `useBrand() === BRAND`; for any other name render the name as text in the same slot (`text-sm font-semibold tracking-wide`). The avatar letter is the first character of `useOwnerName()`, upper-cased.
  - `player-context.tsx`: keep the current name in a ref so a rename does not tear down the player; the player registers with the ref's value, and `deviceName` records what it registered with. `music-view.tsx` compares `nowPlaying.device.name` to `deviceName`, not to the live setting.
  - `policy.ts`: `getOwnerActor()` uses `getOwnerName()`.
  - `settings/page.tsx`: the heading uses `getBrand()`. Leave the Profile section for Task 5.
- [ ] **Step 5: Verify nothing was missed.**

Run: `grep -rn "\bRaj\b" src --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -v "settings/schema.ts"` → no output.
Run: `grep -rln "from \"@/lib/brand\"" src` → only `src/server/settings/schema.ts` and `src/components/shell/sidebar.tsx`.

- [ ] **Step 6:** Run `npx tsc --noEmit && npx eslint && npx vitest run` → all pass.
- [ ] **Step 7: Commit** `feat: read the assistant and owner names from settings everywhere`.

---

### Task 3: Personality file

**Files:**
- Create: `src/lib/persona.ts`, `src/lib/persona.test.ts`, `src/server/hermes/safe-write.ts`, `src/server/hermes/safe-write.test.ts`, `src/server/hermes/persona.ts`, `src/server/hermes/persona.test.ts`
- Modify: `src/server/hermes/config.ts` (`saveHermesConfigText` uses the shared helper)

**Interfaces:**
- Consumes: `hermesHome()` from `@/server/hermes/config`.
- Produces:
  - `@/lib/persona`: `PERSONA_LIMIT = 4000`; `starterPersona(name: string, ownerName: string): string`; `checkPersonaText(value: unknown): string` (returns the text with CRLF turned into LF, or throws an `Error` with a message for the user).
  - `@/server/hermes/safe-write`: `replaceWithBackup(file: string, text: string): Promise<{ backupPath: string | null }>`.
  - `@/server/hermes/persona`: `personaPath(): string`; `loadPersona(): Promise<{ installed: boolean; exists: boolean; text: string }>`; `savePersona(text: string): Promise<{ backupPath: string | null }>`; `class HermesNotInstalledError extends Error`.

- [ ] **Step 1: Write the failing tests.** Each file test uses a fresh folder from `fs.mkdtemp(path.join(os.tmpdir(), "persona-"))` and points `HERMES_HOME` at it with `vi.stubEnv`.

`persona.test.ts` (lib):
```ts
it("the starter names the assistant and the owner and fits the limit", () => {
  const text = starterPersona("Nova", "Prudhvi");
  expect(text).toContain("You are Nova");
  expect(text).toContain("Prudhvi");
  expect(text.length).toBeLessThanOrEqual(PERSONA_LIMIT);
});
it("accepts exactly 4,000 characters and refuses 4,001", () => {
  expect(checkPersonaText("a".repeat(4000))).toHaveLength(4000);
  expect(() => checkPersonaText("a".repeat(4001))).toThrow(/4,000/);
});
it("counts a Windows line ending as one character", () => {
  expect(checkPersonaText("a\r\nb")).toBe("a\nb");
});
it.each([42, null, "", "   \n ", "has\u0000null"])("refuses %j", (bad) => {
  expect(() => checkPersonaText(bad)).toThrow();
});
```

`safe-write.test.ts`: replacing an existing file leaves the new text in place and the old text in the returned backup path, which sits beside the file and matches `/\.bak-dashboard-/`; writing a file that does not exist creates it and returns `backupPath: null`; no `.tmp-` file is left behind in either case; when the folder does not exist it rejects and creates nothing.

`persona.test.ts` (server):
```ts
it("reports Hermes as not installed when its home is missing, and refuses to save", async () => {
  vi.stubEnv("HERMES_HOME", path.join(dir, "nope"));
  expect(await loadPersona()).toEqual({ installed: false, exists: false, text: "" });
  await expect(savePersona("hi")).rejects.toBeInstanceOf(HermesNotInstalledError);
  expect(existsSync(path.join(dir, "nope"))).toBe(false);
});
it("loads empty text when SOUL.md is missing and creates it on first save without a backup", async () => {
  expect(await loadPersona()).toEqual({ installed: true, exists: false, text: "" });
  expect(await savePersona("You are Nova.")).toEqual({ backupPath: null });
  expect((await loadPersona()).text).toBe("You are Nova.");
});
it("backs the old file up before replacing it", async () => {
  await fs.writeFile(path.join(dir, "SOUL.md"), "old");
  const { backupPath } = await savePersona("new");
  expect(await fs.readFile(backupPath!, "utf-8")).toBe("old");
});
it("loads a file longer than the limit in full", async () => {
  await fs.writeFile(path.join(dir, "SOUL.md"), "x".repeat(6000));
  expect((await loadPersona()).text).toHaveLength(6000);
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/persona.test.ts src/server/hermes` → new tests FAIL.
- [ ] **Step 3: Write `lib/persona.ts`.** `checkPersonaText` errors: "Expected text.", "Write something, or use Reset to starter.", "The personality can be at most 4,000 characters." The starter is this copy, with the two names filled in:

```
You are {name}, {owner}'s personal assistant, running on their own PC.

Be concise and dry. Say a thing once, plainly. No filler, no flattery, and no restating the request.
Address {owner} by name now and then, not in every reply.
Match the length of the answer to the weight of the ask: a one-line question gets a one-line answer.
Your replies are often spoken aloud, so write sentences that sound natural when read out, and avoid tables or long lists unless asked.
After finishing work, report what changed, what you verified and what is left. Skip the story of how you got there.
When you are unsure, say so. Agree because something is right, not because {owner} said it.
```

- [ ] **Step 4: Write `safe-write.ts`** by moving the backup, temp-file and rename logic out of `saveHermesConfigText`, with the backup skipped when the file does not exist and the temp file removed if the write or rename fails. `saveHermesConfigText` keeps its signature and its "config must already exist" behaviour.
- [ ] **Step 5: Write `server/hermes/persona.ts`.** `personaPath()` is `path.join(hermesHome(), "SOUL.md")`; nothing from a request ever reaches the path. `savePersona` throws `HermesNotInstalledError` when `hermesHome()` is not a directory.
- [ ] **Step 6:** Run `npx vitest run` → all pass, including the existing Hermes config tests. Run `npx tsc --noEmit && npx eslint`.
- [ ] **Step 7: Commit** `feat: read and safely write Hermes's personality file`.

---

### Task 4: Personality API

**Files:**
- Create: `src/app/api/hermes/persona/route.ts`, `src/app/api/hermes/persona/route.test.ts`

**Interfaces:**
- Consumes: Task 3's `loadPersona`, `savePersona`, `HermesNotInstalledError`, `checkPersonaText`, `PERSONA_LIMIT`; `requireAccess` from `@/server/access/guard`.
- Produces:
  - `GET /api/hermes/persona` → 200 `{ installed: boolean; exists: boolean; text: string; limit: 4000 }`
  - `PUT /api/hermes/persona` with `{ text: string }` → 200 `{ ok: true; text: string; backupPath: string | null }`; 400 `{ error }` for a bad body or text; 409 `{ error: "Hermes isn't installed on this PC." }`; 500 `{ error: "Couldn't write the personality file." }`.

- [ ] **Step 1: Write the failing tests**, in the style of `src/app/api/app-settings/route.test.ts` (requests stamped with `x-access-via`), on a temp `HERMES_HOME`:
  - GET and PUT without the stamp → 403, and the file is untouched.
  - GET on a home with `SOUL.md` containing `"old"` → `{ installed: true, exists: true, text: "old", limit: 4000 }`.
  - PUT `{ text: "You are Nova." }` → 200, the file holds the new text, `backupPath` holds `"old"`.
  - PUT with a body that is not JSON, a JSON array, `{}`, `{ text: 5 }`, `{ text: "" }`, `{ text: "a".repeat(4001) }` → 400 each, file untouched.
  - PUT when `HERMES_HOME` points at a missing folder → 409, and the folder still does not exist.
  - PUT stamped `tailscale` → 200 (the owner's phone may edit it, as it may switch the model).
- [ ] **Step 2:** Run `npx vitest run src/app/api/hermes/persona` → FAIL (no route).
- [ ] **Step 3: Write the route.** No gateway restart: Hermes reads `SOUL.md` when it builds a session's system prompt (`load_soul_md` in its `agent/prompt_builder.py`), so a save applies to the next conversation. Task 5 Step 5 checks that against the running gateway.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit && npx eslint` → all pass.
- [ ] **Step 5: Commit** `feat: add the personality API`.

---

### Task 5: Persona panel

**Files:**
- Create: `src/components/settings/persona-panel.tsx`
- Modify: `src/app/settings/page.tsx`, `README.md`

**Interfaces:**
- Consumes: `useAppSettings()`; Task 4's route; `starterPersona`, `PERSONA_LIMIT` from `@/lib/persona`.

- [ ] **Step 1: Build `PersonaPanel`** (`"use client"`), in two parts that save separately:
  - **Names:** "Assistant name" and "Your name" inputs (`maxLength={24}`), one Save button, disabled until something changed. Save calls `update({ "persona.name", "persona.ownerName" })`, then `router.refresh()` so server-rendered headings and the tab title follow. The server's error message is shown under the fields. A note under the assistant name: "Spotify shows the new name after the next reload."
  - **Personality:** a textarea loaded from `GET /api/hermes/persona`, a live `used / 4,000` counter that turns to the error colour over the limit, Save (disabled when unchanged, empty or over the limit), and "Reset to starter", which fills the textarea from `starterPersona` with the names currently in the fields and does **not** save. After a save: "Saved. Applies to the next conversation. The previous version was backed up." (omit the last sentence when `backupPath` is null).
  - States: loading; `installed: false` → "Hermes isn't installed on this PC, so there is no personality to edit." with the textarea hidden; `exists: false` → empty textarea with "Hermes has no personality file yet. Start from the starter or write your own."; load failure → the message with a Retry button.
  - When the text does not contain the assistant name (case-insensitive) and is not empty: "The personality doesn't mention {name}. Hermes will keep introducing itself by whatever name is written here."
- [ ] **Step 2: Mount it.** In `settings/page.tsx`, replace the hardcoded Profile section with a section titled "Name and personality" (subtitle "What the assistant is called, what it calls you, and how it speaks.") that renders `<PersonaPanel />`.
- [ ] **Step 3: README.** Add a short "Name and personality" paragraph: both names are changed in Settings, `JARVIS_OWNER_NAME` is only the default, and the personality is Hermes's `SOUL.md` with backups written beside it as `SOUL.md.bak-dashboard-<time>`.
- [ ] **Step 4:** Run `npx tsc --noEmit && npx eslint && npx vitest run` → all pass.
- [ ] **Step 5: Check it in the running app** (`preview_start`, then the Settings page):
  - Rename to "Nova" and save → sidebar, Jarvis screen placeholder, settings heading and tab title all read "Nova" without a manual reload; the sidebar shows the name as text, not the Veda wordmark.
  - Change the owner name → the home greeting and the sidebar initial follow.
  - Enter `<script>` as a name → the server's message appears and nothing changes.
  - Press "Reset to starter" → the textarea fills, nothing is written until Save; after Save, a `SOUL.md.bak-dashboard-*` file sits beside `SOUL.md` holding the previous text.
  - With Hermes running, start a new conversation and ask who it is → it answers with the new name. If it still uses the old one, add a gateway restart after save (as the model switch does) and note it in the panel copy.
  - At phone width (375 px) the panel has no horizontal scroll.
  - Rename back to "Veda" → the wordmark image returns.
- [ ] **Step 6: Commit** `feat: add the name and personality panel`.
