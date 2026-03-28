import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as url from "url";
import { OAuth2Client } from "google-auth-library";
import { config, getCallbackUrl } from "../../config.js";

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
  email?: string;
  name?: string;
}

export function createOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    getCallbackUrl()
  );
}

export function loadTokens(): StoredTokens | null {
  try {
    if (!fs.existsSync(config.storage.tokenPath)) return null;
    const raw = fs.readFileSync(config.storage.tokenPath, "utf-8");
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: StoredTokens): void {
  const dir = path.dirname(config.storage.tokenPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(config.storage.tokenPath, JSON.stringify(tokens, null, 2), {
    mode: 0o600, // owner read/write only — tokens are sensitive
  });
}

export function deleteTokens(): void {
  if (fs.existsSync(config.storage.tokenPath)) {
    fs.unlinkSync(config.storage.tokenPath);
  }
}

export function getAuthenticatedClient(): OAuth2Client | null {
  const tokens = loadTokens();
  if (!tokens) return null;

  const client = createOAuthClient();
  client.setCredentials(tokens);

  // Auto-refresh: googleapis handles this automatically when refresh_token is set
  client.on("tokens", (newTokens) => {
    const existing = loadTokens();
    if (existing) {
      saveTokens({
        ...existing,
        ...newTokens,
        expiry_date: newTokens.expiry_date ?? existing.expiry_date,
      });
    }
  });

  return client;
}

/**
 * Runs the full OAuth flow:
 * 1. Starts a local HTTP server to receive the callback
 * 2. Returns the authorization URL for the user to visit
 * 3. Waits for the callback (up to timeoutMs)
 * 4. Exchanges the code for tokens and saves them
 * 5. Fetches the user's profile to store email/name
 */
export async function runOAuthFlow(): Promise<{
  authUrl: string;
  waitForCompletion: () => Promise<StoredTokens>;
}> {
  const client = createOAuthClient();

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: config.google.scopes,
    prompt: "consent", // force consent screen to always get refresh_token
  });

  const waitForCompletion = (): Promise<StoredTokens> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close();
        reject(
          new Error(
            "OAuth timeout: user did not complete login within 2 minutes."
          )
        );
      }, config.oauth.timeoutMs);

      const server = http.createServer(async (req, res) => {
        if (!req.url?.startsWith(config.oauth.callbackPath)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const parsed = url.parse(req.url, true);
        const code = parsed.query["code"] as string | undefined;
        const error = parsed.query["error"] as string | undefined;

        if (error) {
          clearTimeout(timeout);
          server.close();
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(errorPage(error));
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(errorPage("No authorization code received."));
          return;
        }

        try {
          const { tokens } = await client.getToken(code);
          client.setCredentials(tokens);

          // Fetch user info (email, name) to store alongside tokens
          const oauth2 = google.oauth2({ version: "v2", auth: client });
          const { data: userInfo } = await oauth2.userinfo.get();

          const stored: StoredTokens = {
            access_token: tokens.access_token!,
            refresh_token: tokens.refresh_token!,
            scope: tokens.scope!,
            token_type: tokens.token_type!,
            expiry_date: tokens.expiry_date!,
            email: userInfo.email ?? undefined,
            name: userInfo.name ?? undefined,
          };

          saveTokens(stored);

          clearTimeout(timeout);
          server.close();

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(successPage(userInfo.name ?? userInfo.email ?? "you"));

          resolve(stored);
        } catch (err) {
          clearTimeout(timeout);
          server.close();
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(errorPage(String(err)));
          reject(err);
        }
      });

      server.listen(config.oauth.port, "127.0.0.1", () => {
        // Server is ready, caller will now return the authUrl to the user
      });

      server.on("error", (err) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `Could not start OAuth callback server on port ${config.oauth.port}: ${err.message}`
          )
        );
      });
    });
  };

  return { authUrl, waitForCompletion };
}

function successPage(name: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>Meet Agent — Login Successful</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
         justify-content: center; height: 100vh; margin: 0; background: #f0fdf4; }
  .card { text-align: center; padding: 2rem; background: white; border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 400px; }
  .check { font-size: 3rem; }
  h1 { color: #16a34a; margin: 0.5rem 0; }
  p { color: #6b7280; }
</style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>Login successful!</h1>
    <p>Welcome, <strong>${escapeHtml(name)}</strong>.</p>
    <p>Meet Agent now has access to your Gmail, Calendar, and Drive.<br>
       You can close this tab and return to your terminal.</p>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>Meet Agent — Login Failed</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
         justify-content: center; height: 100vh; margin: 0; background: #fef2f2; }
  .card { text-align: center; padding: 2rem; background: white; border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 400px; }
  .x { font-size: 3rem; }
  h1 { color: #dc2626; margin: 0.5rem 0; }
  p { color: #6b7280; font-size: 0.875rem; }
</style>
</head>
<body>
  <div class="card">
    <div class="x">✗</div>
    <h1>Login failed</h1>
    <p>${escapeHtml(message)}</p>
    <p>Close this tab and try <code>/login</code> again.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
