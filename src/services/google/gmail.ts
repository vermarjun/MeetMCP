import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export interface EmailOptions {
  to: string | string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    data: Buffer;
  }>;
}

export class GmailService {
  private gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: "v1", auth });
  }

  async sendEmail(options: EmailOptions): Promise<string> {
    const recipients = Array.isArray(options.to)
      ? options.to.join(", ")
      : options.to;

    const boundary = `boundary_${Date.now()}`;
    const hasAttachments =
      options.attachments && options.attachments.length > 0;

    let rawMessage: string;

    if (hasAttachments) {
      rawMessage = [
        `To: ${recipients}`,
        `Subject: ${options.subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: base64`,
        ``,
        Buffer.from(options.htmlBody).toString("base64"),
        ...options.attachments!.flatMap((att) => [
          `--${boundary}`,
          `Content-Type: ${att.mimeType}`,
          `Content-Transfer-Encoding: base64`,
          `Content-Disposition: attachment; filename="${att.filename}"`,
          ``,
          att.data.toString("base64"),
        ]),
        `--${boundary}--`,
      ].join("\r\n");
    } else {
      rawMessage = [
        `To: ${recipients}`,
        `Subject: ${options.subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: base64`,
        ``,
        Buffer.from(options.htmlBody).toString("base64"),
      ].join("\r\n");
    }

    const encoded = Buffer.from(rawMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encoded },
    });

    return res.data.id ?? "";
  }

  async getProfile(): Promise<{ email: string; name?: string }> {
    const res = await this.gmail.users.getProfile({ userId: "me" });
    return { email: res.data.emailAddress ?? "" };
  }
}
