import type { FilePutOptions, FileStorage } from './file-storage';
import { presignR2GetUrl, type PresignR2GetParams } from './r2-presign';

export type R2PresignEnv = Pick<
  PresignR2GetParams,
  'accountId' | 'bucket' | 'accessKeyId' | 'secretAccessKey'
>;

export class R2Storage implements FileStorage {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly presign?: R2PresignEnv,
  ) {}

  async upload(
    key: string,
    data: ArrayBuffer,
    options?: FilePutOptions,
  ): Promise<{ etag: string }> {
    const obj = await this.bucket.put(key, data, {
      httpMetadata: options?.httpMetadata,
      customMetadata: options?.customMetadata,
    });
    return { etag: obj.etag };
  }

  async download(key: string): Promise<ArrayBuffer> {
    const obj = await this.bucket.get(key);
    if (!obj) {
      throw new Error(`R2 object not found: ${key}`);
    }
    return obj.arrayBuffer();
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const p = this.presign;
    if (!p?.accountId || !p.bucket || !p.accessKeyId || !p.secretAccessKey) {
      throw new Error(
        '预签名 URL 需要配置 R2_ACCOUNT_ID、R2_BUCKET_NAME、R2_S3_ACCESS_KEY_ID、R2_S3_SECRET_ACCESS_KEY（见 backend/README）',
      );
    }
    return presignR2GetUrl({
      accountId: p.accountId,
      bucket: p.bucket,
      key,
      accessKeyId: p.accessKeyId,
      secretAccessKey: p.secretAccessKey,
      expiresInSeconds,
    });
  }

  async initiateMultipartUpload(key: string): Promise<{ uploadId: string }> {
    const mpu = await this.bucket.createMultipartUpload(key);
    return { uploadId: mpu.uploadId };
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    data: ArrayBuffer,
  ): Promise<{ etag: string }> {
    const mpu = this.bucket.resumeMultipartUpload(key, uploadId);
    const part = await mpu.uploadPart(partNumber, data);
    return { etag: part.etag };
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: { etag: string; partNumber: number }[],
  ): Promise<void> {
    const mpu = this.bucket.resumeMultipartUpload(key, uploadId);
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    await mpu.complete(
      sorted.map((p) => ({
        partNumber: p.partNumber,
        etag: p.etag,
      })),
    );
  }
}
