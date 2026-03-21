/**
 * 文件存储抽象（技术方案 §6.4）。
 * 实现类：{@link R2Storage}；未绑定 R2 时使用 {@link NullFileStorage}。
 */

/** 透传至 R2 `put` 的常用选项 */
export type FilePutOptions = {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
};

export interface FileStorage {
  upload(key: string, data: ArrayBuffer, options?: FilePutOptions): Promise<{ etag: string }>;
  download(key: string): Promise<ArrayBuffer>;
  delete(key: string): Promise<void>;
  /**
   * S3 兼容预签名 GET。需在 Env 中配置 R2 API 令牌与 accountId（见 README）。
   * 仅绑定 R2 bucket 不足以生成 URL，还须 API 访问密钥。
   */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  initiateMultipartUpload(key: string): Promise<{ uploadId: string }>;
  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    data: ArrayBuffer,
  ): Promise<{ etag: string }>;
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: { etag: string; partNumber: number }[],
  ): Promise<void>;
}
