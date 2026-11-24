import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { StorageProvider } from '@prisma/client';
import { env } from '../config/env';

/**
 * Where resume files live. `local` writes under STORAGE_LOCAL_PATH (fine for one server);
 * `s3` and `r2` use any S3-compatible bucket so files survive redeploys and scale out.
 * Files are never served publicly; the API streams them only to their owner.
 */
interface Driver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const localRoot = () => path.resolve(env.STORAGE_LOCAL_PATH);

/** Resolves a key inside the storage root and refuses anything that would escape it. */
function localPath(key: string): string {
  const root = localRoot();
  const full = path.resolve(root, key);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Invalid storage key');
  return full;
}

const localDriver: Driver = {
  async put(key, body) {
    const full = localPath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  },
  get: key => fs.readFile(localPath(key)),
  async remove(key) {
    await fs.unlink(localPath(key)).catch(() => {});
  },
};

let s3: S3Client | null = null;
function s3Client(): S3Client {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
    throw new Error('S3/R2 storage needs S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY');
  }
  return (s3 ??= new S3Client({
    // R2 ignores the region but the SDK needs one
    region: env.S3_REGION || 'auto',
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  }));
}

const s3Driver: Driver = {
  async put(key, body, contentType) {
    await s3Client().send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
  },
  async get(key) {
    const out = await s3Client().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    if (!out.Body) throw new Error('Empty object');
    return Buffer.from(await out.Body.transformToByteArray());
  },
  async remove(key) {
    await s3Client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key })).catch(() => {});
  },
};

/** The provider new uploads go to. */
export const currentProvider = (): StorageProvider =>
  env.STORAGE_PROVIDER === 's3' ? 'S3' : env.STORAGE_PROVIDER === 'r2' ? 'R2' : 'LOCAL';

const driverFor = (p: StorageProvider): Driver => (p === 'LOCAL' ? localDriver : s3Driver);

export const storage = {
  put: (key: string, body: Buffer, contentType: string) => driverFor(currentProvider()).put(key, body, contentType),
  get: (provider: StorageProvider, key: string) => driverFor(provider).get(key),
  remove: (provider: StorageProvider, key: string) => driverFor(provider).remove(key),
};
