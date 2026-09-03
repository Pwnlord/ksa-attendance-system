export const PRIVATE_OBJECT_STORAGE = Symbol("PRIVATE_OBJECT_STORAGE");

export interface PrivateObjectMetadata {
  contentType: string;
  byteSize: number;
  checksum: string;
}

export interface PrivateObjectStorage {
  put(key: string, body: Buffer, metadata: PrivateObjectMetadata): Promise<void>;
  createReadUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
