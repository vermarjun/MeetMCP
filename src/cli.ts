#!/usr/bin/env node
import { Command } from "commander";
import { exec } from "child_process";
import { runOAuthFlow, loadTokens, deleteTokens, getAuthenticatedClient } from "./services/google/oauth.js";
import { GmailService } from "./services/google/gmail.js";
import { config } from "./config.js";

function openBrowser(url: string): void {
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

const program = new Command();

program
  .name("meet-agent")
  .description("Meet Agent — AI meeting notes, transcription, and automation")
  .version("0.1.0");

// ─── login ────────────────────────────────────────────────────────────────────

program
  .command("login")
  .description("Connect your Google account (Gmail, Calendar, Drive)")
  .action(async () => {
    const existing = loadTokens();
    if (existing?.refresh_token) {
      console.log(`Already logged in as ${existing.email ?? existing.name ?? "your account"}.`);
      console.log(`Run "meet-agent logout" first to switch accounts.`);
      process.exit(0);
    }

    console.log("Starting Google OAuth...\n");

    let flow: Awaited<ReturnType<typeof runOAuthFlow>>;
    try {
      flow = await runOAuthFlow();
    } catch (err) {
      console.error(`Failed to start OAuth server: ${err instanceof Error ? err.message : err}`);
      console.error(`\nMake sure port ${config.oauth.port} is free, and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set in .env`);
      process.exit(1);
    }

    const { authUrl, waitForCompletion } = flow;

    console.log(`Opening browser for authorization...`);
    console.log(`\nIf the browser doesn't open, visit this URL manually:\n`);
    console.log(`  ${authUrl}\n`);

    try {
      openBrowser(authUrl);
    } catch {
      // non-fatal — user can still copy the URL
    }

    console.log(`Waiting for you to complete authorization (2 min timeout)...`);

    try {
      const tokens = await waitForCompletion();
      const name = tokens.name ? ` (${tokens.name})` : "";
      console.log(`\nLogin successful!`);
      console.log(`Logged in as: ${tokens.email ?? "unknown"}${name}`);
      console.log(`\nGranted scopes:`);
      tokens.scope.split(" ").forEach((s) => console.log(`  • ${s.split("/").pop()}`));
      console.log(`\nCredentials saved to: ${config.storage.tokenPath}`);
      console.log(`\nYou're ready to use Meet Agent. Run "meet-agent status" to confirm.`);
    } catch (err) {
      console.error(`\nLogin failed: ${err instanceof Error ? err.message : err}`);
      console.error(`\nTroubleshooting:`);
      console.error(`  1. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env`);
      console.error(`  2. Make sure "Desktop App" is selected in Google Cloud Console`);
      process.exit(1);
    }
  });

// ─── status ───────────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Check Google account connection and token validity")
  .action(async () => {
    const tokens = loadTokens();

    if (!tokens) {
      console.log(`Not logged in.`);
      console.log(`Run "meet-agent login" to connect your Google account.`);
      process.exit(0);
    }

    const isExpired = tokens.expiry_date ? tokens.expiry_date < Date.now() : false;
    const expiresIn = tokens.expiry_date
      ? Math.round((tokens.expiry_date - Date.now()) / 60_000)
      : null;

    const expiryStatus = isExpired
      ? "Expired (will auto-refresh on next use)"
      : expiresIn !== null
      ? `Valid for ${expiresIn} more minutes`
      : "Unknown";

    console.log(`Account:      ${tokens.email ?? "unknown"}${tokens.name ? ` (${tokens.name})` : ""}`);
    console.log(`Access token: ${expiryStatus}`);
    console.log(`Auto-refresh: ${tokens.refresh_token ? "Enabled" : "Disabled — re-run login"}`);
    console.log(`Token path:   ${config.storage.tokenPath}`);
    console.log(``);
    console.log(`Scopes:`);
    tokens.scope.split(" ").forEach((s) => console.log(`  • ${s.split("/").pop()}`));

    // Live connectivity check
    process.stdout.write(`\nConnectivity: checking...`);
    try {
      const client = getAuthenticatedClient();
      if (!client) throw new Error("No auth client");
      const gmail = new GmailService(client);
      await gmail.getProfile();
      process.stdout.write(`\rConnectivity: Connected\n`);
    } catch (err) {
      process.stdout.write(`\rConnectivity: Failed — ${err instanceof Error ? err.message : err}\n`);
    }
  });

// ─── logout ───────────────────────────────────────────────────────────────────

program
  .command("logout")
  .description("Disconnect your Google account and delete stored credentials")
  .action(() => {
    const tokens = loadTokens();
    if (!tokens) {
      console.log("Not logged in — nothing to remove.");
      process.exit(0);
    }
    const email = tokens.email ?? "your account";
    deleteTokens();
    console.log(`Logged out of ${email}. Credentials deleted.`);
  });

program.parse();
