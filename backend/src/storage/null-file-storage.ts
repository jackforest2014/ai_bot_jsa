import type { FileStorage } from './file-storage';

const MSG =
  'R2 未绑定：请在 wrangler.toml 取消 [[r2_buckets]] 注释并创建同名 bucket，然后重新部署。';

export class NullFileStorage implements FileStorage {
  async upload(): Promise<{ etag: string }> {
    throw new Error(MSG);
  }

  async download(): Promise<ArrayBuffer> {
    throw new Error(MSG);
  }

  async delete(): Promise<void> {
    throw new Error(MSG);
  }

  async getSignedUrl(): Promise<string> {
    throw new Error(MSG);
  }

  async initiateMultipartUpload(): Promise<{ uploadId: string }> {
    throw new Error(MSG);
  }

  async uploadPart(): Promise<{ etag: string }> {
    throw new Error(MSG);
  }

  async completeMultipartUpload(): Promise<void> {
    throw new Error(MSG);
  }
}
