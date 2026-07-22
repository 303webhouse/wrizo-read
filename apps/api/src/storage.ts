import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";

// Object storage is S3-compatible from day one; env-driven; no filesystem snapshots (brief §1).
// The interface is the contract; the S3 adapter is production, the in-memory adapter serves dev
// without credentials and the property suite. Neither ever writes the local filesystem.
export interface Storage {
  put(key: string, body: string, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

export class MemoryStorage implements Storage {
  private readonly objects = new Map<string, Buffer>();

  async put(key: string, body: string): Promise<void> {
    this.objects.set(key, Buffer.from(body, "utf8"));
  }

  async get(key: string): Promise<Buffer | null> {
    return this.objects.get(key) ?? null;
  }
}

export class S3Storage implements Storage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: string, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    const out: GetObjectCommandOutput = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!out.Body) return null;
    const bytes = await out.Body.transformToByteArray();
    return Buffer.from(bytes);
  }
}

export interface StorageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function createStorage(config: StorageConfig): Storage {
  if (config.endpoint && config.bucket) {
    const client = new S3Client({
      endpoint: config.endpoint,
      forcePathStyle: true,
      region: "auto",
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    return new S3Storage(client, config.bucket);
  }
  // No object-storage credentials configured: fall back to in-memory (dev/test only).
  return new MemoryStorage();
}
