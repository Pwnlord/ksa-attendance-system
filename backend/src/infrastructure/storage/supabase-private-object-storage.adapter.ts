import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { AppError } from "../../common/errors/app-error";
import { PrivateObjectMetadata, PrivateObjectStorage } from "./private-object-storage.port";

interface SignedUrlResponse {
  signedURL?: string;
}

function encodedPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

@Injectable()
export class SupabasePrivateObjectStorage implements PrivateObjectStorage {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>("app.supabase.url").replace(/\/$/, "");
    this.serviceRoleKey = config.getOrThrow<string>("app.supabase.serviceRoleKey");
    this.bucket = config.getOrThrow<string>("app.supabase.bucket");
  }

  async put(key: string, body: Buffer, metadata: PrivateObjectMetadata): Promise<void> {
    const checksum = createHash("sha256").update(body).digest("hex");
    if (checksum !== metadata.checksum) {
      throw new AppError(
        "STORAGE_CHECKSUM_MISMATCH",
        400,
        "The private file could not be stored safely.",
      );
    }
    const response = await this.request(
      `/object/${encodeURIComponent(this.bucket)}/${encodedPath(key)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": metadata.contentType,
          "Content-Length": String(metadata.byteSize),
          "x-upsert": "false",
        },
        body: body as unknown as BodyInit,
      },
    );
    if (!response.ok) throw new Error("Private file storage failed.");
  }

  async createReadUrl(key: string, expiresInSeconds: number): Promise<string> {
    const response = await this.request(
      `/object/sign/${encodeURIComponent(this.bucket)}/${encodedPath(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      },
    );
    if (!response.ok) throw new Error("Private file access could not be authorized.");
    const data = (await response.json()) as SignedUrlResponse;
    if (!data.signedURL) throw new Error("Private file access did not return a signed URL.");
    return data.signedURL.startsWith("http")
      ? data.signedURL
      : `${this.baseUrl}/storage/v1${data.signedURL}`;
  }

  async delete(key: string): Promise<void> {
    const response = await this.request(`/object/${encodeURIComponent(this.bucket)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
    });
    if (!response.ok) throw new Error("Private file deletion failed.");
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.baseUrl}/storage/v1${path}`, {
      ...init,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        ...init.headers,
      },
    });
  }
}
