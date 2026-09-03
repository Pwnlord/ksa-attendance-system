import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { SupabasePrivateObjectStorage } from "./supabase-private-object-storage.adapter";

describe("SupabasePrivateObjectStorage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function storage() {
    return new SupabasePrivateObjectStorage(
      new ConfigService({
        app: {
          supabase: {
            url: "https://project.supabase.co",
            serviceRoleKey: "service-role-key",
            bucket: "private-photos",
          },
        },
      }),
    );
  }

  it("uploads to the configured private bucket with backend credentials", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const body = Buffer.from("photo");
    await storage().put("identification-photos/user/photo.jpg", body, {
      contentType: "image/jpeg",
      byteSize: body.length,
      checksum: createHash("sha256").update(body).digest("hex"),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/storage/v1/object/private-photos/identification-photos/user/photo.jpg",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          apikey: "service-role-key",
          Authorization: "Bearer service-role-key",
          "x-upsert": "false",
        }),
      }),
    );
  });

  it("creates a signed URL and removes objects through the private API", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ signedURL: "/object/sign/private-photos/photo.jpg?token=test" }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    const current = storage();

    await expect(current.createReadUrl("photo.jpg", 300)).resolves.toBe(
      "https://project.supabase.co/storage/v1/object/sign/private-photos/photo.jpg?token=test",
    );
    await current.delete("photo.jpg");

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://project.supabase.co/storage/v1/object/private-photos",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ method: "DELETE" }));
  });
});
