import * as dotenv from "dotenv";
import * as path from "path";
import * as os from "os";

dotenv.config();

// Default credentials for the shared Meet Agent OAuth app.
// For Desktop App OAuth clients, the client secret is not confidential by design
// (see https://developers.google.com/identity/protocols/oauth2/native-app).
// Users who want to use their own Google Cloud project can override via .env.
const DEFAULT_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const DEFAULT_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

function getRequired(envKey: string, defaultValue: string): string {
  const value = process.env[envKey] ?? defaultValue;
  if (!value) {
    throw new Error(
      `Missing required credential: ${envKey}\n` +
        `Either set it in .env, or the package default is not configured.\n` +
        `See README.md for setup instructions.`
    );
  }
  return value;
}

export const config = {
  google: {
    clientId: getRequired("GOOGLE_CLIENT_ID", DEFAULT_CLIENT_ID),
    clientSecret: getRequired("GOOGLE_CLIENT_SECRET", DEFAULT_CLIENT_SECRET),
    scopes: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/drive.file",
      "openid",
      "email",
      "profile",
    ],
  },
  oauth: {
    port: parseInt(process.env.OAUTH_CALLBACK_PORT ?? "3847"),
    callbackPath: "/oauth/callback",
    timeoutMs: 120_000, // 2 minutes to complete the OAuth flow
  },
  storage: {
    tokenPath:
      process.env.TOKEN_STORAGE_PATH ??
      path.join(os.homedir(), ".config", "meet-agent", "tokens.json"),
  },
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY ?? "",
  },
};

export function getCallbackUrl(): string {
  return `http://localhost:${config.oauth.port}${config.oauth.callbackPath}`;
}
