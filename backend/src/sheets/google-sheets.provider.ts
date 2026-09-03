import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createSign } from "node:crypto";
import { SheetsProvider, SheetTab } from "./sheets-provider.port";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface GoogleSheetProperties {
  sheetId?: number;
  title?: string;
}

interface GoogleSpreadsheetResponse {
  sheets?: Array<{ properties?: GoogleSheetProperties }>;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

@Injectable()
export class GoogleSheetsProvider implements SheetsProvider {
  private accessToken: string | undefined;
  private accessTokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  async replaceTabs(tabs: readonly SheetTab[]): Promise<void> {
    if (tabs.length === 0) return;
    const spreadsheetId = this.config.get<string>("app.sheets.spreadsheetId");
    const serviceAccountEmail = this.config.get<string>("app.sheets.serviceAccountEmail");
    const privateKey = this.config.get<string>("app.sheets.privateKey");
    if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
      throw new Error("Google Sheets integration is not configured.");
    }

    const token = await this.getAccessToken(serviceAccountEmail, privateKey);
    const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
    const metadata = await this.request<GoogleSpreadsheetResponse>(
      `${baseUrl}?fields=sheets.properties`,
      token,
    );
    const existingTitles = new Set(
      (metadata.sheets ?? [])
        .map((sheet) => sheet.properties?.title)
        .filter((title): title is string => Boolean(title)),
    );
    const missingTitles = tabs
      .map((tab) => tab.title)
      .filter((title) => !existingTitles.has(title));
    if (missingTitles.length > 0) {
      await this.request(`${baseUrl}:batchUpdate`, token, {
        method: "POST",
        body: JSON.stringify({
          requests: missingTitles.map((title) => ({ addSheet: { properties: { title } } })),
        }),
      });
    }

    for (const tab of tabs) {
      const range = quoteSheetTitle(tab.title);
      await this.request(`${baseUrl}/values:batchClear`, token, {
        method: "POST",
        body: JSON.stringify({ ranges: [range] }),
      });
      await this.request(`${baseUrl}/values:batchUpdate`, token, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: [
            {
              range: `${range}!A1`,
              majorDimension: "ROWS",
              values: tab.values.length > 0 ? tab.values : [[""]],
            },
          ],
        }),
      });
    }
  }

  private async getAccessToken(serviceAccountEmail: string, configuredPrivateKey: string) {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.accessTokenExpiresAt > now + 60) return this.accessToken;
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64Url(
      JSON.stringify({
        iss: serviceAccountEmail,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    signer.end();
    const privateKey = configuredPrivateKey.replace(/\\n/g, "\n");
    const assertion = `${header}.${payload}.${base64Url(signer.sign(privateKey))}`;
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) throw new Error("Google Sheets authentication failed.");
    const result = (await response.json()) as GoogleTokenResponse;
    if (!result.access_token) throw new Error("Google Sheets authentication returned no token.");
    this.accessToken = result.access_token;
    this.accessTokenExpiresAt = now + (result.expires_in ?? 3600);
    return result.access_token;
  }

  private async request<T = unknown>(
    url: string,
    token: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Google Sheets request failed with status ${response.status}.`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
