# Meet Agent MCP

An MCP server that gives your AI coding agent (Claude Code, Cursor, etc.) full meeting superpowers — join meetings, transcribe with speaker identification, record, and auto-send AI-generated notes.

Connect it once, and your agent handles everything a paid AI notetaker would, using whatever AI you've plugged it into.

---

## What it does

| Capability | Status |
|---|---|
| Google OAuth (Gmail + Calendar + Drive) | Done |
| Join Google Meet via headless browser (Patchright) | Phase 2 |
| Real-time transcription with speaker diarization (Deepgram) | Phase 2 |
| Record meeting audio/video | Phase 2 |
| Upload recording to Google Drive | Phase 2 |
| AI-generated notes + summary | Phase 2 |
| Email notes via Gmail | Phase 2 |
| Auto-join from Google Calendar | Phase 3 |
| Support for Zoom / Teams | Phase 3 |

---

## Setup

### 1. Install

```bash
git clone <repo>
cd meet-agent
npm install
npm run build
```

### 2. Configure credentials

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in `.env`:

```env
# Required for Google login
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Required for transcription (get free key at deepgram.com)
DEEPGRAM_API_KEY=your_deepgram_key
```

> **Getting Google credentials (one-time, 5 min):**
> 1. Go to [console.cloud.google.com](https://console.cloud.google.com) → New project
> 2. APIs & Services → Enable: Gmail API, Google Calendar API, Google Drive API
> 3. Credentials → Create → OAuth 2.0 Client ID → type: **Desktop App**
> 4. Add redirect URI: `http://localhost:3847/oauth/callback`
> 5. Copy Client ID and Secret into `.env`
>
> On first login you'll see "This app isn't verified" — click **Advanced → Continue**. This is normal for self-hosted OAuth apps. You're authenticating with your own credentials.

### 3. Connect to Claude Code

```bash
claude mcp add meet-agent -- node /path/to/meet-agent/dist/index.js
```

Or add to your Claude Code `settings.json`:

```json
{
  "mcpServers": {
    "meet-agent": {
      "command": "node",
      "args": ["/path/to/meet-agent/dist/index.js"]
    }
  }
}
```

### 4. Login

In Claude Code, run:

```
login
```

A browser window opens. Sign in with your Google account. Done — your agent now has access to your Gmail, Calendar, and Drive.

---

## Tools

### Available now

#### `login`
Connect your Google account. Opens a browser OAuth flow and saves tokens locally.

```
No parameters required.
```

Grants access to: Gmail (send/read), Google Calendar (read), Google Drive (upload files).

Tokens are stored at `~/.config/meet-agent/tokens.json` with restricted file permissions (owner read/write only).

---

#### `auth_status`
Check if you're logged in and what permissions are active.

```
No parameters required.
```

Returns your logged-in email, token validity, auto-refresh status, and a live connectivity check against the Gmail API.

---

#### `logout`
Disconnect your Google account and delete stored credentials.

```
No parameters required.
```

---

### Coming in Phase 2

#### `join_meeting`
Join a Google Meet. The bot joins using your authenticated Google account (no "Guest" label).

```
url           string   Google Meet URL (e.g. https://meet.google.com/abc-defg-hij)
record        bool     Record the meeting. Default: false
```

---

#### `get_transcript`
Get the full transcript with speaker labels and timestamps.

```
meeting_id    string   ID returned by join_meeting
```

Returns structured transcript:
```
[00:00:12] Speaker 0 (Arjun): Let's start with the roadmap...
[00:00:18] Speaker 1 (Priya): I think we should prioritize the API first...
```

---

#### `list_meetings`
Show upcoming Google Calendar events that have a Meet link.

```
hours_ahead   number   How far ahead to look. Default: 24
```

---

#### `send_notes`
Email AI-generated meeting notes via Gmail.

```
meeting_id         string     ID returned by join_meeting
recipients         string[]   Email addresses. Defaults to calendar attendees
include_recording  bool       Attach a Google Drive recording link. Default: false
```

---

## Typical usage flow (Phase 2)

```
You: "Join my 3pm standup and take notes"

Agent:
  → calls list_meetings to find the Meet link
  → calls join_meeting(url, record=false)
  → [meeting happens, bot transcribes in real-time]
  → calls get_transcript(meeting_id)
  → summarizes the transcript using its own intelligence
  → calls send_notes(meeting_id, recipients=[...])
```

The agent does the AI work (summarization, action items, decisions) using its own model. The MCP server handles the infrastructure (browser bot, audio capture, transcription API, email delivery).

---

## Architecture

```
src/
├── index.ts                  MCP server entry, tool registration
├── config.ts                 Env var loading and validation
├── tools/
│   └── auth.ts               login / auth_status / logout tool handlers
└── services/google/
    ├── oauth.ts              OAuth 2.0 flow + token storage + auto-refresh
    ├── gmail.ts              Gmail send client
    ├── calendar.ts           Calendar events client
    └── drive.ts              Drive file upload client
```

**Build:** Uses `esbuild` instead of `tsc` — `googleapis` types are too large for the default TypeScript compiler heap. Run `npm run typecheck` separately if you want type validation.

**Token storage:** `~/.config/meet-agent/tokens.json`, permissions `0600`. Tokens auto-refresh via the googleapis client library.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | — | Google OAuth client secret |
| `OAUTH_CALLBACK_PORT` | No | `3847` | Local port for OAuth callback |
| `TOKEN_STORAGE_PATH` | No | `~/.config/meet-agent/tokens.json` | Where to store OAuth tokens |
| `DEEPGRAM_API_KEY` | Phase 2 | — | Deepgram API key for transcription |

---

## Security notes

- Tokens stored locally with restricted permissions — never sent to any third-party server
- OAuth scopes are minimal: send-only Gmail, read-only Calendar, file-scoped Drive
- Patchright browser runs headless, joins meeting as your authenticated user (not a guest bot)
- Recording is opt-in per meeting (`record: true` flag)
