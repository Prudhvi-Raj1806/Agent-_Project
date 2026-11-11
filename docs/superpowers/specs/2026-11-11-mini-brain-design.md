# Mini brain: a local first responder, with Hermes for the rest

Date: 2026-11-11 · Status: draft for review

## Goal

Everyday requests get a fast, sensible answer on this PC with no internet. A small
local model (the "mini brain") hears every typed or spoken request first. It answers
small talk itself, runs a fixed set of local skills, and hands anything bigger to
Hermes, saying that it is doing so.

Today every request becomes a Hermes mission. With Hermes on `phi4-mini` a one-line
question took about three minutes and the model ignored its personality; nothing
answers at all when Hermes or its model is down.

## What the owner decided

- The mini brain talks and runs local actions. It is not just a router, and it does
  not replace Hermes.
- When a request needs Hermes, the mini brain hands it over on its own and says so.
  It does not ask first.
- Approach: router plus skills. One model call picks from a fixed list. No
  tool-calling loop.

## Non-goals (first version)

- Skills that need a value pulled out of the sentence ("set volume to 40", "add a
  meeting at 3", timers).
- Risky skills. Control Computer stays button-and-passcode only.
- Compound requests ("pause the music and read my schedule"). One request, one pick.
- Streaming replies, or remembering conversations after the page is closed.
- Changing which model Hermes runs on. That is an existing setting (see "Related").

## Evidence

Measured on this PC (Intel Core Ultra 7 258V, integrated Arc GPU, 32 GB, no Nvidia
card; Ollama 0.33.3) with a short routing prompt, 11 choices and 14 requests:

| Model | Size | Route a request (median) | Right of 14 | Short answer | First start |
|---|---|---|---|---|---|
| `phi4-mini` | 2.5 GB | 0.7 s | 13 | 1.8 s | 7 s |
| `gemma4` | 9.6 GB | 4.8 s | 14 | 3.8 s | 14 s |
| `qwen3.5` | 6.6 GB | 6.8 s | 13 | 6.0 s | 18 s |

Fourteen requests is a small sample; the routing check below is what decides whether
accuracy is good enough. The one miss for `phi4-mini` was "skip this song" picked as
pause.

## Architecture

### 1. Request flow

```
typed or spoken request
        │
        ▼
POST /api/brain ──► "Hermes, …" prefix? ──yes──► hand off (no model call)
        │ no
        ▼
router: one call to the local model, answer limited to the list of choices
        │
        ├─ a skill ──► code runs, reply built from real data
        ├─ chat ─────► second model call writes a short reply
        ├─ hermes ───► "That needs Hermes. Handing it over." + mission created
        └─ unclear ──► "I didn't catch what you want. Say it another way?"
```

Targets once the model is loaded: a skill answers within 1.5 s, chat within 4 s.

### 2. The brain (`src/server/brain/`)

- `ollama.ts`: a thin client for Ollama's chat endpoint at `OLLAMA_URL` (default
  `http://127.0.0.1:11434`). Every call sets `keep_alive` to 30 minutes so the model
  stays loaded.
- `router.ts`: builds the routing prompt from the skill list (id, one-line
  description, example phrases) and asks for JSON limited to the choice ids, so an
  id outside the list cannot come back. Temperature 0, at most 30 tokens, 5 second
  timeout. It implements the existing `DecisionModelAdapter` interface
  (`src/server/laya/types.ts`): `question` is "choice", `schema` is the list of ids.
  A different local decision model can be swapped in later without touching callers.
- `skills/`: one small file per skill, registered in `skills/index.ts`.
- `chat.ts`: writes a reply of at most 120 tokens, 15 second timeout, given the
  persona and up to three earlier exchanges.
- `index.ts`: `handleRequest(text, history)`, the only entry point.

A skill is:

```ts
interface BrainSkill {
  id: string;                 // e.g. "music.pause"
  description: string;        // one line, shown to the router
  examples: string[];         // 2 to 4 phrases, shown to the router
  needsInternet: boolean;
  run(): Promise<{ ok: boolean; reply: string }>;
}
```

Skills take no arguments. `reply` is a finished sentence built in code. A skill never
throws to the caller: a failure is `ok: false` with a plain-language reply.

### 3. Choices in the first version

Works with no internet:

| Id | Example | What it does |
|---|---|---|
| `chat` | "tell me a joke" | the local model replies |
| `time.read` | "what time is it" | reads the clock |
| `schedule.read` | "what's on today" | reads the local schedule (`getUiSchedule`) |
| `system.read` | "how's the CPU doing" | reads `getUiSystemStatus` |
| `briefing` | "brief me" | the existing `buildBriefing` |
| `action.open-vscode` | "open VS Code" | existing quick action |
| `action.open-obsidian` | "open Obsidian" | existing quick action |
| `action.take-notes` | "jot down a note" | existing quick action |
| `action.take-screenshot` | "take a screenshot" | existing quick action |
| `action.welcome-routine` | "start my day" | existing quick action |
| `control-computer` | "take over my screen" | does nothing; replies "That one needs your passcode. Use the Control Computer button." |

Needs the internet (the skill says so when it can't reach the service):

| Id | Example | What it does |
|---|---|---|
| `weather.read` | "is it going to rain" | `getCurrentWeather` |
| `music.play`, `music.pause`, `music.next`, `music.previous` | "skip this song" | the Spotify client |
| `music.now-playing` | "what's playing" | `getNowPlaying` |

Always present: `hermes` (needs the internet, email, booking, research, files, or
several steps) and `unclear`.

Quick actions run through the existing registry (`runQuickAction`), so their logging
and risk checks are unchanged. No skill in this version is risky.

### 4. Chat

- The persona is Hermes's `SOUL.md` when it is at most 1,500 characters, so the
  personality edited in Settings applies to both. A longer file would slow every
  answer on this PC, so the brain then uses the short starter built from the two
  names (`starterPersona`), and the status panel says which one is in use.
- One fixed line is added after the persona: reply in one or two sentences that
  sound natural spoken aloud, and if not sure, say so rather than guess.
- The page sends up to three earlier exchanges with each request. Nothing is stored
  on the server.

### 5. Hand-off to Hermes

- The brain creates the mission through the existing mission service, so policy
  checks, approvals and verification are exactly as today.
- A request that starts with "Hermes" followed by a comma or space (any case) skips
  the router: the prefix is removed and the rest becomes the mission objective.
- If Hermes is not running, the reply is "Hermes isn't running. Start it from
  Settings, Services." and no mission is created.

### 6. API

All routes use `requireAccess`, so the owner's phone can use them.

- `POST /api/brain` with `{ text, history? }`. `text` is 1 to 2,000 characters;
  `history` is at most 6 messages of at most 1,000 characters each. Returns one of:
  - `{ kind: "reply", text, choice, ok }` (a skill or chat answered)
  - `{ kind: "handoff", text, missionId, notice? }` (`text` is empty when the brain
    is switched off or unavailable, so the page says nothing extra; `notice` is
    "The mini brain is off." when it was unavailable, for the page to show)
  - `{ kind: "unclear", text }`
  - 400 for a bad body; nothing is run.
- `GET /api/brain`: `{ enabled, model, ollamaRunning, modelInstalled, modelLoaded, installed, persona: "soul" | "starter", lastAnswerMs }`, where `installed` lists the models Ollama has.
- `POST /api/brain/warm`: loads the model if it is not loaded. Returns the same
  status.

### 7. Pages

- **Jarvis screen:** sends each request to `/api/brain`. A reply is spoken and shown
  as it is today for mission results. A hand-off speaks the hand-off line, then
  follows the mission with the existing code. Opening the screen calls the warm
  route. Each reply carries a small tag: "Mini brain" or "Hermes".
- **Command bar:** sends to `/api/brain`. A reply or an unclear answer is shown
  under the bar for 8 seconds and is not spoken. A hand-off goes to the Work page,
  as today.

### 8. Settings

Two new keys in the registry:

| Key | Type | Default |
|---|---|---|
| `brain.enabled` | boolean | `true` |
| `brain.model` | Ollama model name: lower-case letters, digits and `. _ : / -`, 1 to 64 characters | `phi4-mini` |

A "Mini brain" section in Settings: the switch, a model picker listing what Ollama
has installed, the status from `GET /api/brain`, and a Test button that sends
"hello" and shows how long the answer took.

## When things go wrong

| Situation | Behaviour |
|---|---|
| `brain.enabled` is off | Every request is handed to Hermes, as today. No hand-off line. |
| Ollama is not running | The brain starts it through the existing Services control (Windows only) and waits up to 20 seconds before answering. If it still isn't up, the request is handed to Hermes and the page shows "The mini brain is off." |
| Any answer takes longer than 2.5 seconds | The Jarvis screen says "One moment." once while it waits (a cold start, or Ollama being started). |
| The chosen model isn't installed | Same as unavailable; the status panel names the missing model. |
| The router times out or returns something unreadable | Treated as `unclear`. |
| Chat times out | "That took too long. Try again?" |
| A skill fails | Its own plain-language reply (`ok: false`). Not retried through Hermes. |
| Hermes is down at hand-off | "Hermes isn't running. Start it from Settings, Services." |
| The router picks wrongly | The tag on the reply shows who answered; "Hermes, …" forces a hand-off. |

## Security and governance

The mini brain is a second path that acts without going through Hermes's approvals.
That is a real gap in governance coverage, and it is kept safe by construction, not
by review:

- It can run only the skills in the fixed list. Request text never reaches a shell,
  a file path, or a tool name; the model's answer is limited to the list of ids.
- Every skill in this version does something a dashboard button already does, and
  none is risky. Adding a risky skill later means routing it through the voice
  passcode gate, and is a separate design.
- Everything handed to Hermes goes through the unchanged mission path.
- Every decision is written to the existing event log with `missionId` null and
  `source: "brain"`: `brain.routed` (choice, milliseconds, the first 200 characters
  of the request), `brain.skill.completed` or `brain.skill.failed`,
  `brain.handoff` (mission id), and `brain.unavailable`.
- The model runs on this PC. Request text leaves the machine only when a skill calls
  its own service (weather, Spotify) or the request is handed to Hermes.

## Testing

- Unit tests (vitest), with a fake model client: prompt contents, parsing, the
  "Hermes," prefix, `unclear` on timeout and on unreadable output; each skill with
  fake data sources, including its offline reply; hand-off creates a mission and
  reports a stopped Hermes; every row of the table above.
- Route tests for the 403 and 400 paths and the three response kinds.
- Routing check against the real model, run on demand with `npm run brain:eval`
  because it needs Ollama: at least 60 phrases with the expected pick, kept in
  `src/server/brain/eval/phrases.json`. It passes when at least 90% are right and
  no phrase that expects `hermes` is answered as `chat`.
- By hand: a spoken round trip on the Jarvis screen with Wi-Fi off (dictation,
  routing, a skill, a chat reply, speech), and a hand-off with Hermes running.

## Related, outside this design

- **Hermes's model.** Hermes is set to `phi4-mini`, which is too weak for tool work.
  Once it only receives the hard requests it should be switched to a stronger model
  from the existing Hermes panel. No code is needed.
- **Dictation.** The mic button drives Handy, a local dictation app, so listening
  does not need the internet. This is from reading the code; it has not been tried
  with Wi-Fi off. Speaking is covered by Kokoro, which is local.
- **Next steps after this version:** skills with arguments (volume, add an event,
  timers), then compound requests.

## Build order

Each step ends with typecheck, lint, tests and a commit.

1. Ollama client, router and the routing check, with `chat`, `hermes`, `unclear`
   and two skills (`time.read`, `system.read`), so accuracy is known early.
2. The remaining skills.
3. Chat and the persona rule.
4. `POST /api/brain`, hand-off, the failure table, and events.
5. Jarvis screen and command bar.
6. Settings keys, the Mini brain section, warm-up and auto-start.

## Open decisions

None blocking.
