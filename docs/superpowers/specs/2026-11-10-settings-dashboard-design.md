# Settings dashboard: control everything from one place

Date: 2026-11-10 · Status: draft for review

## Goal

The owner (Raj, single user, local machine) can run and tune the whole stack from
the Settings page, without a terminal or editing files: start and stop the
services it depends on, change how it speaks, change its name and personality,
and trade visual quality for CPU.

## Non-goals

- Editing API keys or secrets. They stay in `.env.local` / Hermes's `.env`; the UI
  only shows whether one is set.
- Free-form editing of any config file. Every control writes a specific, validated
  setting.
- Multi-user accounts, remote access, or authentication beyond "this machine only".

## Already built (not re-done here)

Hermes panel: status, provider/model switch with config backup, gateway restart
(`src/server/hermes/{config,gateway,local-request}.ts`, `/api/hermes/*`,
`components/settings/hermes-panel.tsx`). The Services panel generalises
`gateway.ts`; the Hermes panel stays as the place for model choice.

## Architecture

### 1. Settings store (foundation)

A new table `app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`
in the existing SQLite database; `value` is JSON. Code lives in `src/server/settings/`:

- `schema.ts`: the registry of known keys, each with a type, default and validator.
  Unknown keys are rejected, so the API can never store arbitrary data.
- `store.ts`: `getSetting(key)`, `getAllSettings()`, `setSettings(partial)`. Reads
  return the stored value or the registry default. Validation runs on every write.
- Route `GET/PUT /api/app-settings`: returns all settings / applies a validated
  partial update. Local-only via the existing `isLocalRequest`.
- Client: `AppSettingsProvider` (mounted in the root layout, seeded server-side) and
  `useAppSettings()` so a change applies immediately across the app with no reload.

Environment variables remain the fallback default (for example `VOICESTUDIO_VOICE`
and `JARVIS_OWNER_NAME`), so existing `.env.local` files keep working. A stored
setting wins over the env default.

Initial keys:

| Key | Type | Default |
|---|---|---|
| `persona.name` | string, 1 to 24 chars | `BRAND` from `lib/brand.ts` ("Veda") |
| `persona.ownerName` | string, 1 to 24 chars | `JARVIS_OWNER_NAME` or "Raj" |
| `voice.provider` | `auto \| voicestudio \| elevenlabs \| browser` | `auto` |
| `voice.voicestudioVoice` | string, safe characters only | `VOICESTUDIO_VOICE` or `alloy` |
| `voice.autoSendDictation` | boolean | `false` |
| `perf.globeQuality` | `low \| balanced \| high` | `balanced` |
| `perf.lowPower` | boolean | `false` |
| `dock.items` | subset of `brief, music, work, calendar, focus` | all |

### 2. Services panel

`src/server/services/` holds a fixed registry; each entry has `id`, `label`, a health
probe, and `start` / `stop` functions. There is no way to pass a command from the
request: the API takes only a service id and an action.

| Service | Health probe | Start | Stop |
|---|---|---|---|
| Hermes | `GET {HERMES_AGENT_URL}/health` returns 200 | `{HERMES_HOME}/bin/hermes.exe gateway run`, detached | stop `hermes.exe` whose command line is `gateway run` (existing logic) |
| Voice Studio | `GET {VOICESTUDIO_URL}/health` returns 200 | `VoiceStudio.exe` (path from `VOICESTUDIO_EXE`, default `C:\Program Files\VoiceStudio`), detached | stop its main process tree (the Electron process and the backend it supervises) |
| OmniRoute | TCP connect to port 20128 (the API answers 401 without a key, which still means "up") | `omniroute serve`, detached | `omniroute stop` |
| Ollama | `GET 127.0.0.1:11434/api/tags` returns 200 | `ollama serve`, detached | stop `ollama.exe` and `ollama app.exe` |

Each service also reports detail where cheap: Hermes version and latency, Voice Studio
version and active engine, Ollama loaded models with an "unload" button.

Routes: `GET /api/services` (all statuses) and `POST /api/services/{id}/{start|stop|restart}`.
`start` waits up to 60 s for the probe to pass and returns the final status;
`restart` is stop then start. All routes use `isLocalRequest`.

Windows only for start/stop (that is where these are installed); on other platforms the
panel shows status and disables the buttons.

### 3. Persona and name

- The name and owner name come from the settings store and replace the static `BRAND`
  at runtime: `useBrand()` on the client, `getBrand()` on the server, and the page title
  via `generateMetadata`. `lib/brand.ts` keeps the default.
- The personality prompt is Hermes's own `SOUL.md` (`{HERMES_HOME}/SOUL.md`), which is
  how Hermes takes on a personality. The panel loads it, edits it in a textarea
  (length limit 4,000 characters), backs the old file up beside it before each save,
  and offers "Reset to starter", a Veda-flavoured template (concise, dry, addresses the
  owner by name). The file is the source of truth, not the database.
- Spotify's device name follows the name setting the next time the player registers.

### 4. Voice

- `server/voice/tts.ts` reads `voice.provider` and `voice.voicestudioVoice`: `auto`
  keeps today's order (Voice Studio, then ElevenLabs, then browser); a fixed provider
  skips the others.
- The panel lists Voice Studio's engines (`GET /engines/tts`) and switches the active
  one (`POST /engines/select`) when Voice Studio is running. That setting lives inside
  Voice Studio, not our database.
- A "Test voice" button calls `/api/voice/speak` with a short line and plays it, showing
  which provider answered and how long it took.
- ElevenLabs is shown read-only: "configured" if both env vars are set.
- `voice.autoSendDictation` seeds the existing checkbox on the Jarvis screen.

### 5. Performance and behaviour

- `perf.globeQuality` maps to particle count and frame caps: low 2,800 particles
  (idle 12 fps, active 24), balanced 5,200 (20 / 36), high 7,200 (30 / 45).
- `perf.lowPower` forces `low`, slows background polls (Spotify, voice status,
  notifications) by 3x, and pauses the globe while idle.
- `dock.items` chooses which quick actions the Jarvis screen shows.
- `jarvis-globe.tsx` and the polling hooks read these through `useAppSettings()`.

## Security

- Every new route calls `isLocalRequest` (rejects non-local Host and any foreign
  Origin).
- Settings writes are validated against the registry; strings use character allow-lists.
- Service control is a closed set of ids and actions; no shell string is built from
  request data. Process stops match on process name plus command line.
- File writes (Hermes `SOUL.md`) back up first and write atomically.
- No secret is read or returned. Env presence is reported as a boolean.

## Known risk: how the dashboard server is started

Processes the dashboard starts inherit the environment of the dashboard's own server.
If that server was launched from a sandboxed host (as happened with Voice Studio and
Claude's app), Windows can redirect a started app's `%APPDATA%` writes into that host's
private store and break the app. Mitigation: the Services panel shows a warning when
the server process looks sandboxed (its `APPDATA` resolves under `\Packages\`), and the
README states to run `npm start` from a normal terminal. Starting detached through
Explorer is the fallback if direct spawning proves unreliable in testing.

## Testing

- Unit tests (vitest): settings registry validation and defaults, store round-trip on
  an in-memory database, service registry (command-line matching, health parsing),
  persona file backup and atomic write, tts provider selection, globe quality mapping.
- Route tests for the 403 and 400 paths.
- Manual check in the browser for each panel; start and stop verified against the real
  services where installed (Hermes, Voice Studio, Ollama, OmniRoute).

## Build order

Each step ends with typecheck, lint, tests and a commit.

1. Settings store, route and client provider.
2. Services panel (highest value: no more terminals).
3. Persona and name.
4. Voice.
5. Performance and behaviour.

## Open decisions

None blocking. Defaults above can be changed in `schema.ts` without a migration.
