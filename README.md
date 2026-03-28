# Meet Agent MCP

An MCP server that connects to your AI coding agent (Claude Code, Cursor, etc.) and gives it full meeting automation — join Google Meets, transcribe with speaker identification, record, and email AI-generated notes to attendees.

The AI agent (Claude) handles summarization and note-taking using its own intelligence. This server handles the infrastructure: browser bot, audio capture, transcription API, Google integrations.

---

## Current status

| Feature | Status |
|---|---|
| Google OAuth — Gmail, Calendar, Drive | **Done** |
| CLI — `meet-agent login/status/logout` | **Done** |
| MCP server — agent tool registration | **Done** |
| Join Google Meet (Patchright headless browser) | Phase 2 |
| Real-time transcription with speaker diarization (Deepgram) | Phase 2 |
| Record meeting audio/video | Phase 2 |
| Upload recording to Google Drive | Phase 2 |
| Email notes via Gmail | Phase 2 |
| Auto-join from Google Calendar | Phase 3 |
| Zoom / Teams support | Phase 3 |

---

## Prerequisites

Before starting, make sure you have the following installed:

### 1. Node.js (v18 or higher)

```bash
node --version   # must be v18+
```

If not installed, download from [nodejs.org](https://nodejs.org) or use a version manager:

```bash
# macOS with Homebrew
brew install node
```

### 2. A Google Cloud project with OAuth credentials

This is required for Gmail, Calendar, and Drive access.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project** → **New Project** → give it any name → **Create**
3. Go to **APIs & Services** → **Enable APIs and Services** → search for and enable each of these three:
   - **Gmail API**
   - **Google Calendar API**
   - **Google Drive API**
4. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. If prompted to configure a consent screen first: choose **External**, fill in your app name and email, save. You can skip optional fields.
6. For application type, select **Desktop App** → give it a name → **Create**
7. Copy the **Client ID** and **Client Secret** shown — you'll need these in the next step

> **Note:** You do not need to add any redirect URIs for Desktop App type. Google automatically allows `http://localhost` on any port, which is how the login flow works.

### 3. A Deepgram account (for Phase 2 transcription)

Not needed until Phase 2. When ready, sign up at [deepgram.com](https://deepgram.com) and get a free API key.

---

## Installation

### Step 1 — Clone and install dependencies

```bash
git clone <repo-url>
cd Meet_Agent
npm install
```

### Step 2 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your credentials:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here

# Leave these as-is unless you need to change them
OAUTH_CALLBACK_PORT=3847

# Not needed until Phase 2
DEEPGRAM_API_KEY=your_deepgram_key_here
```

### Step 3 — Build the project

```bash
npm run build
```

This compiles both:
- `dist/index.js` — the MCP server (used by Claude Code)
- `dist/cli.js` — the CLI (used by you directly in the terminal)

### Step 4 — Install the CLI globally

This makes the `meet-agent` command available in your terminal from any directory.

Check if `~/.local/bin` is in your PATH:

```bash
echo $PATH | grep -o '.local/bin'
```

If it prints `.local/bin`, run:

```bash
mkdir -p ~/.local/bin
cat > ~/.local/bin/meet-agent << 'EOF'
#!/bin/sh
exec node /path/to/Meet_Agent/dist/cli.js "$@"
EOF
chmod +x ~/.local/bin/meet-agent
```

Replace `/path/to/Meet_Agent` with the actual absolute path to where you cloned the repo.

If `~/.local/bin` is **not** in your PATH, add it by appending to your shell config:

```bash
# for zsh (default on macOS)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Verify it works:

```bash
meet-agent --help
```

### Step 5 — Login with Google

```bash
meet-agent login
```

This will:
1. Start a local server on port 3847 to receive the OAuth callback
2. Open your browser to Google's authorization page
3. Ask you to sign in and grant permissions (Gmail, Calendar, Drive)
4. Save your tokens to `~/.config/meet-agent/tokens.json` with restricted permissions

If the browser doesn't open automatically, copy the URL printed in the terminal and open it manually.

On the consent screen you may see **"This app isn't verified"** — click **Advanced** → **Continue**. This is expected for self-hosted OAuth apps authenticating with your own credentials.

Verify the login worked:

```bash
meet-agent status
```

You should see your email and `Connectivity: Connected`.

### Step 6 — Register the MCP server with Claude Code

```bash
claude mcp add meet-agent --scope user -- node /path/to/Meet_Agent/dist/index.js
```

The `--scope user` flag makes it available in all your projects, not just this directory.

Then **restart Claude Code** completely. The MCP server is launched automatically by Claude Code on startup — you do not run it manually.

Verify it's registered:

```bash
claude mcp list
```

You should see `meet-agent` listed.

---

## CLI reference

Auth and server management are done through the CLI, not through the AI agent.

```bash
meet-agent login     # Connect your Google account via browser OAuth
meet-agent status    # Show login state, token expiry, live connectivity check
meet-agent logout    # Delete stored credentials
meet-agent --help    # List all commands
```

You only need to run `login` once. Tokens are stored locally and auto-refresh — you won't need to log in again unless you explicitly log out or revoke access in your Google account settings.

---

## MCP tools reference

These are available to your AI agent (e.g. Claude Code) once the MCP server is registered.

### Available now

| Tool | Description |
|---|---|
| `auth_status` | Check if Meet Agent is connected, show email and scopes |
| `login` | OAuth login (prefer the CLI version instead) |
| `logout` | Delete credentials (prefer the CLI version instead) |

### Available in Phase 2

| Tool | Parameters | Description |
|---|---|---|
| `join_meeting` | `url` (string), `record` (bool, default false) | Join a Google Meet as a bot using your account |
| `get_transcript` | `meeting_id` (string) | Get full transcript with speaker labels and timestamps |
| `list_meetings` | `hours_ahead` (number, default 24) | List upcoming calendar events with Meet links |
| `send_notes` | `meeting_id`, `recipients` (string[]), `include_recording` (bool) | Email notes via Gmail |

---

## How it works end-to-end (Phase 2 preview)

```
You: "Join my 3pm standup and send notes to the team"

Claude:
  1. calls list_meetings        → finds the Meet URL and attendee emails
  2. calls join_meeting(url)    → bot joins the call using your Google account
     [meeting runs, audio is streamed to Deepgram in real-time]
  3. calls get_transcript()     → gets timestamped transcript with speaker labels:
                                   [00:01:12] Speaker 0 (Arjun): ...
                                   [00:01:18] Speaker 1 (Priya): ...
  4. Claude summarizes the transcript, extracts action items and decisions
  5. calls send_notes()         → emails the notes via Gmail to all attendees
```

The AI does the thinking. The MCP server handles the plumbing.

---

## Project structure

```
Meet_Agent/
├── src/
│   ├── index.ts                  MCP server — registers all tools, runs on stdio
│   ├── cli.ts                    CLI entry point — login/status/logout commands
│   ├── config.ts                 Loads .env, validates required credentials
│   ├── tools/
│   │   └── auth.ts               Shared handlers for login, auth_status, logout
│   └── services/google/
│       ├── oauth.ts              OAuth 2.0 flow, token storage, auto-refresh
│       ├── gmail.ts              Gmail API client — send emails
│       ├── calendar.ts           Calendar API client — read events
│       └── drive.ts              Drive API client — upload files
├── dist/                         Built output (generated by npm run build)
│   ├── index.js                  MCP server binary
│   └── cli.js                    CLI binary
├── build.mjs                     esbuild config — builds both targets simultaneously
├── .env                          Your credentials (gitignored)
├── .env.example                  Template for .env
└── package.json
```

**Why esbuild instead of tsc?** The `googleapis` package has enormous TypeScript type declarations that exceed the default Node.js heap when running `tsc`. `esbuild` transpiles without type checking and builds in under a second. Run `npm run typecheck` separately if you want full type validation.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | — | From Google Cloud Console OAuth credentials |
| `GOOGLE_CLIENT_SECRET` | Yes | — | From Google Cloud Console OAuth credentials |
| `OAUTH_CALLBACK_PORT` | No | `3847` | Local port used during the login OAuth callback |
| `TOKEN_STORAGE_PATH` | No | `~/.config/meet-agent/tokens.json` | Where credentials are saved after login |
| `DEEPGRAM_API_KEY` | Phase 2 | — | Deepgram API key for transcription and diarization |

---

## Security

- Credentials are stored at `~/.config/meet-agent/tokens.json` with `0600` permissions (only your user can read them)
- Tokens never leave your machine — no third-party relay server
- OAuth scopes requested are minimal: Gmail send+read, Calendar read-only, Drive file-scoped upload
- The MCP server communicates with Claude Code via stdio (local process) — no network port is opened
- The Patchright browser bot (Phase 2) joins meetings as your authenticated Google user, not as an anonymous guest
- Recording is explicitly opt-in per meeting via the `record: true` flag
