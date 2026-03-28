import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  handleLoginWithUrl,
  handleAuthStatus,
  handleLogout,
} from "./tools/auth.js";
import { config, getCallbackUrl } from "./config.js";
import { runOAuthFlow } from "./services/google/oauth.js";

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "meet-agent",
  version: "0.1.0",
});

// ─── login tool ───────────────────────────────────────────────────────────────
// Initiates Google OAuth. Returns a URL, waits for callback, stores tokens.

server.tool(
  "login",
  "Connect Meet Agent to your Google account (Gmail, Calendar, Drive). " +
    "Starts an OAuth flow — you'll receive a URL to open in your browser. " +
    "Run this once before using any other tools.",
  {},
  async () => {
    // Step 1: Start the OAuth server and generate the URL
    const { authUrl, waitForCompletion } = await runOAuthFlow();

    // Step 2: Kick off the background wait BEFORE returning the URL message
    const completionPromise = waitForCompletion();

    // Step 3: Return the URL immediately so Claude shows it to the user
    // This is returned as an early signal — but MCP holds the connection
    // open until the full promise resolves.
    // Since MCP tools are single-response, we print the URL to stderr
    // (visible in Claude Code's tool output) and block on the promise.
    process.stderr.write(
      `\n[meet-agent] Open this URL to authorize:\n${authUrl}\n\n`
    );

    try {
      const tokens = await completionPromise;
      const name = tokens.name ? ` (${tokens.name})` : "";
      const scopes = tokens.scope
        .split(" ")
        .map((s) => `  • ${s.split("/").pop()}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: [
              `Login successful!`,
              ``,
              `Logged in as: ${tokens.email ?? "unknown"}${name}`,
              ``,
              `Scopes granted:`,
              scopes,
              ``,
              `Credentials saved. You now have access to Gmail, Calendar, and Drive.`,
              `Run auth_status to verify, or start using meeting tools.`,
            ].join("\n"),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: [
              `Login failed: ${message}`,
              ``,
              `Open this URL manually to try again:`,
              authUrl,
              ``,
              `Make sure your .env has GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET,`,
              `and that this redirect URI is registered in Google Cloud Console:`,
              `  ${getCallbackUrl()}`,
            ].join("\n"),
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── auth_status tool ─────────────────────────────────────────────────────────

server.tool(
  "auth_status",
  "Check if Meet Agent is connected to your Google account. Shows login status, email, and granted permissions.",
  {},
  async () => {
    const result = await handleAuthStatus();
    return { content: [{ type: "text", text: result }] };
  }
);

// ─── logout tool ─────────────────────────────────────────────────────────────

server.tool(
  "logout",
  "Disconnect Meet Agent from your Google account and delete stored credentials.",
  {},
  async () => {
    const result = await handleLogout();
    return { content: [{ type: "text", text: result }] };
  }
);

// ─── Placeholder tools (to be implemented in next phases) ────────────────────

server.tool(
  "list_meetings",
  "List upcoming Google Calendar events that have a Meet link. Requires login first.",
  {
    hours_ahead: z
      .number()
      .optional()
      .describe("How many hours ahead to look (default: 24)"),
  },
  async ({ hours_ahead = 24 }) => {
    return {
      content: [
        {
          type: "text",
          text: `list_meetings is not yet implemented. Coming in Phase 2.\nRun login first if you haven't.`,
        },
      ],
    };
  }
);

server.tool(
  "join_meeting",
  "Join a Google Meet using a headless browser bot. The bot will transcribe and optionally record the meeting.",
  {
    url: z.string().describe("Google Meet URL (e.g. https://meet.google.com/xxx-xxxx-xxx)"),
    record: z
      .boolean()
      .optional()
      .describe("Record the meeting audio/video (default: false)"),
  },
  async ({ url, record = false }) => {
    return {
      content: [
        {
          type: "text",
          text: `join_meeting is not yet implemented. Coming in Phase 2.\nURL: ${url}, record: ${record}`,
        },
      ],
    };
  }
);

server.tool(
  "get_transcript",
  "Get the transcript (with speaker labels and timestamps) for a meeting.",
  {
    meeting_id: z.string().describe("Meeting ID returned by join_meeting"),
  },
  async ({ meeting_id }) => {
    return {
      content: [
        {
          type: "text",
          text: `get_transcript is not yet implemented. Coming in Phase 2.\nMeeting ID: ${meeting_id}`,
        },
      ],
    };
  }
);

server.tool(
  "send_notes",
  "Email meeting notes (and optionally a recording link) to specified recipients via Gmail.",
  {
    meeting_id: z.string().describe("Meeting ID returned by join_meeting"),
    recipients: z
      .array(z.string())
      .optional()
      .describe("Email addresses to send notes to (defaults to calendar attendees)"),
    include_recording: z
      .boolean()
      .optional()
      .describe("Include recording link in the email (default: false)"),
  },
  async ({ meeting_id, recipients, include_recording }) => {
    return {
      content: [
        {
          type: "text",
          text: `send_notes is not yet implemented. Coming in Phase 2.\nMeeting: ${meeting_id}, recipients: ${JSON.stringify(recipients)}, include_recording: ${include_recording}`,
        },
      ],
    };
  }
);

// ─── Start server ─────────────────────────────────────────────────────────────

async function main() {
  // Validate config on startup — fail fast with a clear message
  try {
    const _cfg = config; // triggers required() checks
  } catch (err) {
    process.stderr.write(
      `[meet-agent] Configuration error: ${err instanceof Error ? err.message : err}\n`
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[meet-agent] MCP server running (stdio)\n`);
}

main().catch((err) => {
  process.stderr.write(`[meet-agent] Fatal error: ${err}\n`);
  process.exit(1);
});
