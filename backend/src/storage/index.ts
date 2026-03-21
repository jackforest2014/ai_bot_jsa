import type { FileStorage } from './file-storage';
import { NullFileStorage } from './null-file-storage';
import { R2Storage, type R2PresignEnv } from './r2-storage';

/** Worker Env 中与 R2 / 预签名相关的绑定与变量 */
export type FileStorageEnv = {
  FILES?: R2Bucket;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_S3_ACCESS_KEY_ID?: string;
  R2_S3_SECRET_ACCESS_KEY?: string;
};

export function createFileStorage(env: FileStorageEnv): FileStorage {
  if (!env.FILES) {
    return new NullFileStorage();
  }

  let presign: R2PresignEnv | undefined;
  if (
    env.R2_ACCOUNT_ID &&
    env.R2_BUCKET_NAME &&
    env.R2_S3_ACCESS_KEY_ID &&
    env.R2_S3_SECRET_ACCESS_KEY
  ) {
    presign = {
      accountId: env.R2_ACCOUNT_ID,
      bucket: env.R2_BUCKET_NAME,
      accessKeyId: env.R2_S3_ACCESS_KEY_ID,
      secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY,
    };
  }

  return new R2Storage(env.FILES, presign);
}

export function hasR2Binding(env: FileStorageEnv): boolean {
  return !!env.FILES;
}

export function hasR2PresignConfig(env: FileStorageEnv): boolean {
  return !!(
    env.R2_ACCOUNT_ID &&
    env.R2_BUCKET_NAME &&
    env.R2_S3_ACCESS_KEY_ID &&
    env.R2_S3_SECRET_ACCESS_KEY
  );
}

export type { FilePutOptions, FileStorage } from './file-storage';
export { NullFileStorage } from './null-file-storage';
export { R2Storage, type R2PresignEnv } from './r2-storage';
