# Settings Dashboard: Foundation, Services and Phone Access (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A settings store, a whole-app access gate, a Services panel and a Remote access panel with a phone-ready layout, so the owner can run the stack from the dashboard on the PC and on the phone over Tailscale.

**Architecture:** One SQLite `app_settings` table behind a typed registry. A pure `evaluateAccess` function decides every request; `src/proxy.ts` (Next 16 Proxy, Node runtime) applies it and stamps trusted requests with `x-access-via`. The server binds to loopback; `tailscale serve` is the only way in from another device. Services and Tailscale are driven through closed lists of fixed commands.

**Tech Stack:** Next.js 16 (App Router, Proxy), React 19, TypeScript, `node:sqlite`, Tailwind 4, vitest 3, Tailscale CLI.

**Spec:** `docs/superpowers/specs/2026-11-10-settings-dashboard-design.md`. Plan 2 (persona and name, voice, performance) follows once this lands and adds its keys to the registry built in Task 1.

## Global Constraints

- Read `node_modules/next/dist/docs/` before writing Next-specific code; Next 16 renames Middleware to **Proxy** (`src/proxy.ts`, export `proxy`, Node runtime, no `runtime` config).
- Run `npx tsc --noEmit`, `npx eslint src` and `npx vitest run` before every commit; all must pass.
- Commit messages carry **no** `Co-authored-by` trailer of any kind (user rule); author is the existing git identity.
- No secret is ever read, returned or logged. Environment presence is reported as a boolean only.
- No request data is ever placed in a shell string; process control uses fixed executables and argument arrays.
- `127.0.0.1` binding: `dev` and `start` scripts pass `-H 127.0.0.1`.
- Windows is the only platform with start/stop; elsewhere the panels show status and disable buttons.
- Vitest currently includes only `src/server/**` and `src/lib/**`; Task 2 adds `src/app/**/*.test.ts`.
- Tests run on an in-memory database via `resetDbForTests(":memory:")` from `@/server/db/client`.

## Review Focus

1. A client that sends `Tailscale-User-Login` straight to the server while remote access is off or its login isn't listed must get 403.
2. A request with `Host: localhost` **and** a Tailscale header must not count as local; the header forces the remote rules.
3. A client-supplied `x-access-via` header must be stripped or overwritten by the Proxy, never trusted.
4. Remote access on with an empty allowed-logins list must allow nobody; login matching ignores case.
5. A settings update with one invalid key must store nothing (all-or-nothing), and a service action with an unknown id or action must return 400 and run nothing.

---

### Task 1: Settings registry and store

**Files:**
- Create: `src/server/settings/schema.ts`, `src/server/settings/store.ts`
- Modify: `src/server/db/schema.ts` (add table to `SCHEMA_SQL`)
- Test: `src/server/settings/store.test.ts`

**Interfaces:**
- Produces:
  - `interface SettingsShape { "remote.enabled": boolean; "remote.allowedLogins": string[]; "remote.tailnetHost": string }`
  - `type SettingKey = keyof SettingsShape`
  - `const SETTING_DEFS: { [K in SettingKey]: { default: SettingsShape[K]; parse(value: unknown): SettingsShape[K] } }` where `parse` throws `Error` on invalid input
  - `getSetting<K extends SettingKey>(key: K): SettingsShape[K]`
  - `getAllSettings(): SettingsShape`
  - `setSettings(patch: Partial<SettingsShape>): SettingsShape` (validates every key first; unknown key or invalid value throws and writes nothing; one transaction)

- [ ] **Step 1: Write failing tests** in `store.test.ts` (names and assertions):
  - `defaults when nothing stored`: `getAllSettings()` equals `{ "remote.enabled": false, "remote.allowedLogins": [], "remote.tailnetHost": "" }`.
  - `round-trips a partial update`: `setSettings({ "remote.enabled": true })` then `getSetting("remote.enabled") === true`, other keys still default.
  - `rejects an unknown key and stores nothing`: `expect(() => setSettings({ nope: 1 } as never)).toThrow(/unknown/i)`.
  - `all-or-nothing`: `setSettings({ "remote.enabled": true, "remote.allowedLogins": "x" as never })` throws and `remote.enabled` is still `false`.
  - `logins are trimmed, lower-cased, de-duplicated and capped at 5`; an item with a space inside or over 200 characters throws.
  - `tailnetHost accepts only a DNS name or empty`: `"pc.tail1234.ts.net"` ok; `"evil.com/x"` and `"a b"` throw.
- [ ] **Step 2: Run** `npx vitest run src/server/settings` → FAIL (module missing).
- [ ] **Step 3: Implement.** Add to `SCHEMA_SQL`: `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);`. Values are JSON strings; `getSetting` returns the stored value through `parse`, or the default when absent or unparsable. Writes use `INSERT ... ON CONFLICT(key) DO UPDATE` inside `BEGIN`/`COMMIT`. Use `nowIso` from `@/server/db/util`.
- [ ] **Step 4: Run** `npx vitest run src/server/settings` → PASS.
- [ ] **Step 5: Commit** `feat: add typed app settings store`.

### Task 2: Settings API route and client provider

**Files:**
- Create: `src/app/api/app-settings/route.ts`, `src/lib/settings/app-settings-context.tsx`
- Modify: `vitest.config.ts` (add `"src/app/**/*.test.ts"` to `include`), `src/components/shell/app-shell.tsx` (wrap children), `src/app/layout.tsx` (seed initial settings; make it `async` and read `getAllSettings()`)
- Test: `src/app/api/app-settings/route.test.ts`

**Interfaces:**
- Consumes: Task 1 `getAllSettings`, `setSettings`, `SettingsShape`; Task 3 `requireAccess(request: Request): NextResponse | null` (until Task 3 lands, the route simply omits the check and Task 3 adds it).
- Produces: `GET /api/app-settings` → `SettingsShape`; `PUT /api/app-settings` body `Partial<SettingsShape>` → `SettingsShape` or 400 `{ error }`. Client: `AppSettingsProvider({ initial: SettingsShape; children })` and `useAppSettings(): { settings: SettingsShape; update(patch: Partial<SettingsShape>): Promise<void> }` (applies the server's returned settings, throws the server's message on 400).

- [ ] **Step 1: Write failing route tests**: `GET returns defaults`; `PUT applies a valid partial and returns the full object`; `PUT with an invalid value returns 400 and a following GET shows no change`; `PUT with a non-JSON body returns 400`. Call the exported `GET`/`PUT` with `new Request("http://localhost/api/app-settings", ...)`.
- [ ] **Step 2: Run** `npx vitest run src/app/api/app-settings` → FAIL.
- [ ] **Step 3: Implement** the route (thin: parse JSON, call `setSettings`, map thrown `Error` to 400) and the provider (state seeded from `initial`; `update` PUTs and replaces state with the response).
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 5: Commit** `feat: add app settings API and client provider`.

### Task 3: Access gate, Proxy and loopback binding

**Files:**
- Create: `src/server/access/gate.ts`, `src/server/access/guard.ts`, `src/proxy.ts`
- Modify: `package.json` (scripts), `src/app/api/hermes/config/route.ts`, `src/app/api/hermes/restart/route.ts` (replace `isLocalRequest` with `requireAccess`)
- Delete: `src/server/hermes/local-request.ts`, `src/server/hermes/local-request.test.ts`
- Test: `src/server/access/gate.test.ts`, `src/server/access/guard.test.ts`

**Interfaces:**
- Consumes: Task 1 `getAllSettings`; `recordAudit` from `@/server/security/audit` (entry `{ actorId, action, resourceType, resourceId, result, reason }`).
- Produces:
  - `interface AccessInput { host: string | null; origin: string | null; tailscaleLogin: string | null; remoteEnabled: boolean; allowedLogins: string[]; tailnetHost: string }`
  - `type AccessDecision = { allow: true; via: "local" } | { allow: true; via: "tailscale"; login: string } | { allow: false; reason: string }`
  - `evaluateAccess(input: AccessInput): AccessDecision`
  - `ACCESS_HEADER = "x-access-via"`; `requireAccess(request: Request): NextResponse | null` (null when the header is `local` or `tailscale`, else a 403 JSON response)
  - `proxy(request: NextRequest): NextResponse` plus `export const config = { matcher: [...] }` excluding `_next/static`, `_next/image`, `favicon.ico`.

- [ ] **Step 1: Write failing `gate.test.ts`** (each a named test with the decision asserted):
  - `local: no tailscale header, host localhost:3000 → via local`; also `127.0.0.1`, `[::1]`.
  - `local with a foreign Origin → denied`; `Origin: null → denied`.
  - `tailscale allowed when remote on, login listed, host equals tailnetHost`.
  - `tailscale denied when remote off` (Review Focus 1); `denied when login not listed`; `denied when host differs`.
  - `Host localhost plus a Tailscale header is judged as remote, not local` (Review Focus 2): with remote off → denied.
  - `empty allowedLogins allows nobody even when enabled`; `login match ignores case` (Review Focus 4).
  - `lookalike hosts denied`: `localhost.evil.com`, missing host.
- [ ] **Step 2: Write failing `guard.test.ts`**: `requireAccess returns null for x-access-via local and tailscale`, `returns a 403 NextResponse for missing or any other value`.
- [ ] **Step 3: Run** `npx vitest run src/server/access` → FAIL.
- [ ] **Step 4: Implement `gate.ts`** exactly as the spec's gate table: a Tailscale header always selects the remote rules; hostname comparison via `new URL`; `tailnetHost` compared lower-case.
- [ ] **Step 5: Implement `proxy.ts`**: read `getAllSettings()` through a 2-second in-memory cache (invalidate on write is unnecessary); build `AccessInput` from `host`, `origin`, `tailscale-user-login` headers; **delete any incoming `x-access-via`** then set it from the decision on the forwarded request headers via `NextResponse.next({ request: { headers } })` (Review Focus 3); on deny return `new NextResponse("Forbidden", { status: 403 })`; for `via: "tailscale"` and methods other than GET/HEAD/OPTIONS call `recordAudit({ actorId: login, action: "remote.request", resourceType: "http", resourceId: \`${method} ${pathname}\`, result: "allowed" })` in a try/catch that never blocks the request.
- [ ] **Step 6: Update scripts**: `"dev": "next dev -H 127.0.0.1"`, `"start": "next start -H 127.0.0.1"`. Replace the two Hermes route checks with `requireAccess`; delete `local-request.*`.
- [ ] **Step 7: Verify in the real server**: run `npx vitest run src/server/access`, start `npm run dev` on a free port, then with `curl`: no headers → 200; `-H "Tailscale-User-Login: x@y"` → 403; `-H "x-access-via: local" -H "Tailscale-User-Login: x@y"` → 403; `-H "Host: example.com"` → 403. Record outputs in the commit body. Expected: exactly those statuses.
- [ ] **Step 8: Commit** `feat: gate the whole app with a proxy and bind to loopback`.

### Task 4: Services control (server)

**Files:**
- Create: `src/server/services/process.ts`, `src/server/services/registry.ts`, `src/server/services/controller.ts`, `src/app/api/services/route.ts`, `src/app/api/services/[id]/[action]/route.ts`
- Modify: `src/server/hermes/gateway.ts` (export `startHermesGateway(): Promise<void>` and `stopHermesGateway(): Promise<number>`; `restartHermesGateway` composes them and keeps its behaviour)
- Test: `src/server/services/controller.test.ts`, `src/server/services/process.test.ts`, `src/app/api/services/route.test.ts`

**Interfaces:**
- Consumes: Task 3 `requireAccess`; existing `isGatewayCommandLine`, `hermesHome`, `getHermesAdapter().checkHealth()`.
- Produces:
  - `type ServiceId = "hermes" | "voicestudio" | "omniroute" | "ollama"`; `type ServiceAction = "start" | "stop" | "restart"`
  - `interface ServiceStatus { id: ServiceId; label: string; running: boolean; detail: string | null; canControl: boolean }`
  - `interface ServiceDef { id: ServiceId; label: string; probe(): Promise<{ running: boolean; detail: string | null }>; start(): Promise<void>; stop(): Promise<void> }`
  - `createServiceController(defs: ServiceDef[], opts?: { waitMs?: number; pollMs?: number })` → `{ statuses(): Promise<ServiceStatus[]>; run(id: string, action: string): Promise<ServiceStatus> }`; `run` throws `ServiceInputError` for an unknown id or action (route maps to 400)
  - `process.ts`: `spawnDetached(file: string, args: string[]): void`; `findProcesses(imageName: string): Promise<{ pid: number; commandLine: string }[]>`; `killPids(pids: number[], tree?: boolean): Promise<void>`; pure `isVoiceStudioMain(commandLine: string): boolean` (true when the line has no `--type=`)
  - `registry.ts`: `getServiceDefs(): ServiceDef[]` with the spec's four services: Hermes (existing gateway functions), Voice Studio (probe `GET {VOICESTUDIO_URL|http://localhost:3900}/health`, detail `v{version} · {device}`; start `VOICESTUDIO_EXE` or `C:\Program Files\VoiceStudio\VoiceStudio.exe`; stop kills the main process tree), OmniRoute (probe: TCP connect to 20128 counts as running; start `omniroute.cmd serve` from `%APPDATA%\npm`; stop `omniroute.cmd stop`), Ollama (probe `GET http://127.0.0.1:11434/api/tags`, detail = loaded model names from `/api/ps`; start `ollama serve`; stop kills `ollama.exe` and `ollama app.exe`).

- [ ] **Step 1: Write failing `controller.test.ts`** with fake defs: `statuses lists every service with running and detail`; `start waits until the probe reports running, then returns it`; `start returns running:false truthfully when the probe never passes within waitMs`; `restart stops then starts, in that order`; `stop waits until not running`; `unknown id throws ServiceInputError and calls nothing`; `unknown action throws ServiceInputError and calls nothing` (Review Focus 5).
- [ ] **Step 2: Write failing `process.test.ts`**: `isVoiceStudioMain` true for the bare exe line, false for `--type=renderer` and `--type=gpu-process` lines; `killPids ignores an empty list`.
- [ ] **Step 3: Write failing route tests**: `GET /api/services` without `x-access-via` → 403; with it → 200 and an array; `POST /api/services/nope/start` → 400; `POST /api/services/hermes/explode` → 400 (inject the controller through a small `getServiceController()` module-level function the test can override).
- [ ] **Step 4: Run** `npx vitest run src/server/services src/app/api/services` → FAIL.
- [ ] **Step 5: Implement** the modules. `controller.run` polls `probe` every `pollMs` (default 1000) up to `waitMs` (default 60000 for start, 15000 for stop). `process.ts` uses `execFile` with `powershell.exe -NoProfile -NonInteractive` for listing (as `gateway.ts` already does) and `taskkill /PID n /F` (plus `/T` when `tree`) for stopping; no string is built from request input. On non-Windows `canControl` is false and `start`/`stop` throw.
- [ ] **Step 6: Run** full `npx vitest run` → PASS.
- [ ] **Step 7: Verify on the real machine** (Ollama and Hermes are installed): `curl` `GET /api/services` shows each service's true state; `POST /api/services/ollama/stop` then `start` flips it and back. Expected statuses match `netstat` and `tasklist`.
- [ ] **Step 8: Commit** `feat: add services control`.

### Task 5: Services panel

**Files:**
- Create: `src/components/settings/services-panel.tsx`
- Modify: `src/app/settings/page.tsx` (add a "Services" section above "Hermes")

**Interfaces:**
- Consumes: Task 4 routes (`GET /api/services`, `POST /api/services/{id}/{action}`); `StatusIndicator` and the button/field class strings used in `hermes-panel.tsx`.

- [ ] **Step 1: Implement `ServicesPanel`**: rows per service with `StatusIndicator` (Running / Stopped), the `detail` text, and Start / Stop / Restart buttons that disable while any action is in flight and show a spinner; failed or timed-out actions show the server's message; refresh status after each action and every 10 s while the tab is visible; buttons disabled when `canControl` is false.
- [ ] **Step 2: Verify in the browser** (`npm run dev`): open `/settings`, confirm four rows with correct states, stop and start Ollama from the panel, and confirm `tasklist` agrees. Capture a screenshot.
- [ ] **Step 3: Run** `npx tsc --noEmit && npx eslint src` → clean.
- [ ] **Step 4: Commit** `feat: add services panel to settings`.

### Task 6: Tailscale helpers and Remote access API

**Files:**
- Create: `src/server/access/tailscale.ts`, `src/server/access/exposure.ts`, `src/app/api/remote-access/route.ts`, `src/app/api/remote-access/serve/route.ts`
- Test: `src/server/access/tailscale.test.ts`, `src/server/access/exposure.test.ts`, `src/app/api/remote-access/route.test.ts`

**Interfaces:**
- Consumes: Task 1 settings; Task 3 `requireAccess`; `listRemoteAudit` below.
- Produces:
  - `parseTailscaleStatus(json: unknown): { running: boolean; loginName: string | null; dnsName: string | null }` (`dnsName` has the trailing dot removed; from `Self.DNSName` and `User[Self.UserID].LoginName`; tolerant of missing fields)
  - `buildServeArgs(port: number): string[]` → `["serve", "--bg", "--https=443", "http://127.0.0.1:<port>"]`; `SERVE_RESET_ARGS = ["serve", "reset"]`
  - `parseServeUrl(output: string): string | null` (first `https://…ts.net` URL)
  - `runTailscale(args: string[]): Promise<{ ok: boolean; output: string }>` (finds `tailscale.exe` at `C:\Program Files\Tailscale` or on PATH; 20 s timeout; never throws)
  - `checkLanExposure(port: number, probe?: (address: string, port: number) => Promise<boolean>): Promise<{ exposed: boolean; address: string | null }>` (tries the first non-internal IPv4 address from `os.networkInterfaces()`)
  - `listRemoteAudit(limit: number): { at: string; login: string; request: string }[]` (reads `audit_events` where `action = 'remote.request'`, newest first)
  - `GET /api/remote-access` → `{ enabled, allowedLogins, tailnetHost, url, tailscale: { installed, running, loginName, dnsName }, exposure: { exposed, address }, recent }`; `PUT` body `{ enabled?: boolean; allowedLogins?: string[] }` → same object; `POST /api/remote-access/serve` body `{ action: "enable" | "disable" }` → `{ ok, output, url }`.

- [ ] **Step 1: Write failing tests**: `parseTailscaleStatus` on a realistic sample (assert login and dnsName without the trailing dot) and on `{}` (nulls); `buildServeArgs(3000)` equals the array above; `parseServeUrl` extracts `https://pc.tail1234.ts.net/` from sample output and returns null for none; `checkLanExposure` returns `exposed:true` when the probe resolves true and `false` when it rejects or returns false (inject `probe`); route tests: `GET` without header → 403; `PUT { enabled: true, allowedLogins: [] }` stores both; `POST serve` with `action: "format-disk"` → 400.
- [ ] **Step 2: Run** `npx vitest run src/server/access src/app/api/remote-access` → FAIL.
- [ ] **Step 3: Implement.** `serve enable`: run `buildServeArgs`, parse the URL (fall back to `https://<dnsName>/`), store `remote.tailnetHost` from `dnsName`, and, when `allowedLogins` is empty, store the detected `loginName` as the only allowed login. `disable`: run `SERVE_RESET_ARGS` and leave `remote.enabled` untouched. Check `tailscale serve --help` first and adjust `buildServeArgs` and its test if the installed CLI's flags differ.
- [ ] **Step 4: Run** full `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `feat: add tailscale helpers and remote access API`.

### Task 7: Remote access panel

**Files:**
- Create: `src/components/settings/remote-access-panel.tsx`
- Modify: `src/app/settings/page.tsx` (section "Phone and remote access"); add the `qrcode` package (`npm install qrcode` and `npm install -D @types/qrcode`) for the QR image

**Interfaces:**
- Consumes: Task 6 routes.

- [ ] **Step 1: Implement `RemoteAccessPanel`**: master switch for `remote.enabled` (PUT); status lines (Tailscale running as `loginName`; serving URL or "not set up"); "Enable phone access" and "Disable" buttons (POST serve) showing `output` text on failure, with the one-line hint "Turn on HTTPS certificates in the Tailscale admin console" when output mentions HTTPS or certificates; the URL as a link plus a QR code (`QRCode.toDataURL`) rendered only when the URL exists; allowed logins as removable chips with an add field; a warning banner when `exposure.exposed` is true: "This server is reachable on your network at {address}. Restart it with `npm run dev` or `npm start` (they bind to 127.0.0.1)"; the last 10 remote requests.
- [ ] **Step 2: Verify in the browser**: toggle remote on and off and reload to confirm persistence; run Enable phone access and confirm `tailscale serve status` shows the proxy; open the URL on this PC through the tailnet name and confirm the page loads only when remote is on and returns the 403 page when off. Capture screenshots.
- [ ] **Step 3: Run** `npx tsc --noEmit && npx eslint src && npx vitest run` → PASS.
- [ ] **Step 4: Commit** `feat: add remote access panel`.

### Task 8: Responsive phone shell

**Files:**
- Create: `src/components/shell/bottom-nav.tsx`
- Modify: `src/components/shell/app-shell.tsx`, `src/components/shell/sidebar.tsx` (hidden below `md`), `src/components/shell/top-bar.tsx` (compact below `md`), `src/app/settings/page.tsx` (`px-4 sm:px-8`), `src/components/jarvis/jarvis-screen.tsx` (phone spacing)

**Interfaces:**
- Produces: `BottomNav()` with the five primary routes (Home, the assistant screen, Work, Focus, Settings), icons from `lucide-react`, each target at least 44 px, visible only below `md`, with `pb-[env(safe-area-inset-bottom)]`.

- [ ] **Step 1: Implement** the shell changes: below `md` the sidebar is hidden and the bottom nav shows; `main` gets bottom padding equal to the nav height; the top bar hides the date chip and shrinks the command bar; panels in Settings stack to one column.
- [ ] **Step 2: Verify at 390×844 and 768×1024** with the browser's resize tool on `/`, `/jarvis`, `/work`, `/settings`: no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), the bottom nav is reachable, the Jarvis input and dock are fully visible, every button is at least 44 px (`getBoundingClientRect`). Capture screenshots; then reset to desktop and confirm the desktop layout is unchanged.
- [ ] **Step 3: Run** `npx tsc --noEmit && npx eslint src` → clean.
- [ ] **Step 4: Commit** `feat: add responsive phone layout`.

### Task 9: Documentation and end-to-end phone check

**Files:**
- Modify: `README.md` (new "Phone access" section), `docs/superpowers/specs/2026-11-10-settings-dashboard-design.md` (one line: remote audit records mutating requests only, to avoid logging every poll)

- [ ] **Step 1: Write the README section**: start with `npm run dev` or `npm start` from a normal terminal (not from inside a sandboxed app); turn on HTTPS certificates once in the Tailscale admin console; open Settings → Phone and remote access, press Enable phone access, switch remote on, scan the QR code on the phone (signed into the same Tailscale account).
- [ ] **Step 2: Manual end-to-end from the actual phone**: load the dashboard over the tailnet URL; open Settings, switch Hermes' model and confirm the restart; stop and start a service; confirm `GET` of the same URL from a device off the tailnet fails; turn remote off on the PC and confirm the phone gets 403 within one reload.
- [ ] **Step 3: Run** `npx tsc --noEmit && npx eslint src && npx vitest run` → all pass.
- [ ] **Step 4: Commit** `docs: document phone access`.
