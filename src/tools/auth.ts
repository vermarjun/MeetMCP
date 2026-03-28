import { z } from "zod";
import {
  runOAuthFlow,
  loadTokens,
  deleteTokens,
  getAuthenticatedClient,
} from "../services/google/oauth.js";
import { GmailService } from "../services/google/gmail.js";
import { CalendarService } from "../services/google/calendar.js";

export const loginToolDefinition = {
  name: "login",
  description:
    "Connect Meet Agent to your Google account (Gmail, Calendar, Drive). " +
    "Opens a browser-based OAuth flow. Run this once before using any meeting tools.",
  inputSchema: z.object({}),
};

export async function handleLogin(): Promise<string> {
  // Check if already authenticated
  const existingTokens = loadTokens();
  if (existingTokens?.refresh_token) {
    const identity = existingTokens.email ?? existingTokens.name ?? "your account";
    return (
      `Already logged in as ${identity}.\n` +
      `Run \`logout\` first if you want to switch accounts.`
    );
  }

  const { authUrl, waitForCompletion } = await runOAuthFlow();

  // Return the URL immediately so the user can click it,
  // then await the OAuth callback in the background.
  // We wrap this in a promise that MCP will await.
  const completionPromise = waitForCompletion();

  // Signal the URL to the user synchronously by returning it as part of the
  // tool response. The tool will then block until the OAuth callback arrives.
  console.error(
    `[meet-agent] OAuth flow started. Waiting for user to authorize...`
  );

  try {
    const tokens = await completionPromise;
    const name = tokens.name ? ` (${tokens.name})` : "";
    return (
      `✓ Login successful!\n\n` +
      `Logged in as: ${tokens.email ?? "unknown"}${name}\n` +
      `Scopes granted:\n` +
      tokens.scope
        .split(" ")
        .map((s) => `  • ${s.split("/").pop()}`)
        .join("\n") +
      `\n\nYour credentials are stored at: ${
        process.env.TOKEN_STORAGE_PATH ?? "~/.config/meet-agent/tokens.json"
      }\n\n` +
      `You can now use:\n` +
      `  • join_meeting  — join a Google Meet\n` +
      `  • list_meetings — see upcoming calendar events with Meet links\n` +
      `  • send_notes    — email meeting notes via Gmail\n` +
      `\nRun \`auth_status\` to verify your connection at any time.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Login failed: ${message}\n\nMake sure:\n  1. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in .env\n  2. http://localhost:${process.env.OAUTH_CALLBACK_PORT ?? 3847}/oauth/callback is in your OAuth app's Redirect URIs`;
  }
}

// ─── /login response includes the URL ────────────────────────────────────────
// The MCP tool handler needs to first tell the user the URL, then wait.
// We split this into two parts: the URL is returned immediately as part
// of the tool's initial response, then we resolve once auth completes.
// Since MCP tools are request/response, we handle this by returning a message
// that includes the URL AND blocks on the completion promise.

export async function handleLoginWithUrl(): Promise<string> {
  const existingTokens = loadTokens();
  if (existingTokens?.refresh_token) {
    const identity = existingTokens.email ?? existingTokens.name ?? "your account";
    return (
      `Already logged in as **${identity}**.\n` +
      `Run \`logout\` first if you want to switch accounts.`
    );
  }

  const { authUrl, waitForCompletion } = await runOAuthFlow();

  // Kick off the wait before returning the message
  const completionPromise = waitForCompletion();

  // This message is returned to the AI, which will show it to the user
  console.error(`[meet-agent] Waiting for OAuth at: ${authUrl}`);

  // Now block on the completion — MCP holds the connection open
  try {
    const tokens = await completionPromise;
    const name = tokens.name ? ` (${tokens.name})` : "";
    return [
      `**Login successful!**`,
      ``,
      `Logged in as: **${tokens.email ?? "unknown"}**${name}`,
      ``,
      `Scopes granted:`,
      ...tokens.scope.split(" ").map((s) => `  • ${s.split("/").pop()}`),
      ``,
      `Credentials saved to: \`${
        process.env.TOKEN_STORAGE_PATH ?? "~/.config/meet-agent/tokens.json"
      }\``,
      ``,
      `You now have access to Gmail, Calendar, and Drive. Try \`auth_status\` to confirm.`,
    ].join("\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      `**Login failed:** ${message}`,
      ``,
      `Authorization URL (try again):`,
      authUrl,
      ``,
      `Troubleshooting:`,
      `  1. Ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in .env`,
      `  2. Add this Redirect URI to your Google Cloud OAuth app:`,
      `     http://localhost:${process.env.OAUTH_CALLBACK_PORT ?? 3847}/oauth/callback`,
    ].join("\n");
  }
}

// ─── auth_status tool ─────────────────────────────────────────────────────────

export const authStatusToolDefinition = {
  name: "auth_status",
  description:
    "Check if Meet Agent is connected to your Google account. Shows login status, email, and granted permissions.",
  inputSchema: z.object({}),
};

export async function handleAuthStatus(): Promise<string> {
  const tokens = loadTokens();

  if (!tokens) {
    return [
      `**Not logged in.**`,
      ``,
      `Run \`login\` to connect your Google account (Gmail, Calendar, Drive).`,
    ].join("\n");
  }

  const isExpired = tokens.expiry_date
    ? tokens.expiry_date < Date.now()
    : false;

  const expiresIn = tokens.expiry_date
    ? Math.round((tokens.expiry_date - Date.now()) / 60_000)
    : null;

  const expiryStatus =
    expiresIn === null
      ? "Unknown"
      : isExpired
      ? "Expired (will auto-refresh on next use)"
      : `Valid for ${expiresIn} more minutes`;

  const hasRefreshToken = !!tokens.refresh_token;

  // Quick connectivity check — try fetching Gmail profile
  let connectivityStatus = "Not verified";
  try {
    const client = getAuthenticatedClient();
    if (client) {
      const gmail = new GmailService(client);
      await gmail.getProfile();
      connectivityStatus = "Connected ✓";
    }
  } catch (err) {
    connectivityStatus = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const scopes = tokens.scope.split(" ").map((s) => s.split("/").pop() ?? s);

  return [
    `**Auth Status: ${connectivityStatus}**`,
    ``,
    `Account: **${tokens.email ?? "unknown"}**${tokens.name ? ` (${tokens.name})` : ""}`,
    `Access token: ${expiryStatus}`,
    `Auto-refresh: ${hasRefreshToken ? "Enabled ✓" : "Disabled — re-run login"}`,
    ``,
    `Granted scopes:`,
    ...scopes.map((s) => `  • ${s}`),
    ``,
    `Token path: \`${process.env.TOKEN_STORAGE_PATH ?? "~/.config/meet-agent/tokens.json"}\``,
  ].join("\n");
}

// ─── logout tool ─────────────────────────────────────────────────────────────

export const logoutToolDefinition = {
  name: "logout",
  description: "Disconnect Meet Agent from your Google account and delete stored credentials.",
  inputSchema: z.object({}),
};

export async function handleLogout(): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) {
    return "Not logged in — nothing to remove.";
  }
  const email = tokens.email ?? "your account";
  deleteTokens();
  return `Logged out of **${email}**. Stored credentials have been deleted.`;
}
