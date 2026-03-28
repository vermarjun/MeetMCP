import { google, drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";

export interface UploadedFile {
  id: string;
  name: string;
  webViewLink: string;
  downloadLink: string;
}

export class DriveService {
  private drive: drive_v3.Drive;

  constructor(auth: OAuth2Client) {
    this.drive = google.drive({ version: "v3", auth });
  }

  /**
   * Upload a file buffer to Google Drive.
   * Returns a publicly shareable view link.
   */
  async uploadFile(
    name: string,
    mimeType: string,
    data: Buffer | Readable,
    folderId?: string
  ): Promise<UploadedFile> {
    const media = {
      mimeType,
      body: data instanceof Buffer ? Readable.from(data) : data,
    };

    const requestBody: drive_v3.Schema$File = { name };
    if (folderId) {
      requestBody.parents = [folderId];
    }

    const res = await this.drive.files.create({
      requestBody,
      media,
      fields: "id, name, webViewLink, webContentLink",
    });

    const fileId = res.data.id!;

    // Make the file readable by anyone with the link
    await this.drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });

    return {
      id: fileId,
      name: res.data.name ?? name,
      webViewLink: res.data.webViewLink ?? "",
      downloadLink: res.data.webContentLink ?? "",
    };
  }

  /**
   * Upload a local file path to Google Drive.
   */
  async uploadLocalFile(
    filePath: string,
    mimeType: string,
    folderId?: string
  ): Promise<UploadedFile> {
    const name = path.basename(filePath);
    const stream = fs.createReadStream(filePath);
    return this.uploadFile(name, mimeType, stream, folderId);
  }

  /**
   * Create a folder in Drive. Returns the folder ID.
   */
  async createFolder(name: string, parentId?: string): Promise<string> {
    const requestBody: drive_v3.Schema$File = {
      name,
      mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) {
      requestBody.parents = [parentId];
    }
    const res = await this.drive.files.create({
      requestBody,
      fields: "id",
    });
    return res.data.id!;
  }
}
