import { Injectable } from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConfigService } from "@nestjs/config";
import { PrivateObjectMetadata, PrivateObjectStorage } from "./private-object-storage.port";

@Injectable()
export class R2PrivateObjectStorage implements PrivateObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const accessKeyId = config.getOrThrow<string>("app.r2.accessKeyId");
    const secretAccessKey = config.getOrThrow<string>("app.r2.secretAccessKey");
    this.bucket = config.getOrThrow<string>("app.r2.bucket");
    const endpoint =
      config.get<string>("app.r2.endpoint") ??
      `https://${config.getOrThrow<string>("app.r2.accountId")}.r2.cloudflarestorage.com`;

    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, metadata: PrivateObjectMetadata): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: metadata.contentType,
        ContentLength: metadata.byteSize,
        ChecksumSHA256: Buffer.from(metadata.checksum, "hex").toString("base64"),
        Metadata: { checksum: metadata.checksum },
      }),
    );
  }

  async createReadUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
