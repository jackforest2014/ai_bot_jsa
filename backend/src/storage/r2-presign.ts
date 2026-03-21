/**
 * R2 S3 兼容 API：AWS SigV4 查询参数预签名 GET（不引入 aws-sdk）。
 * @see https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 */

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return toHex(digest);
}

async function hmacRaw(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function getSignatureKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const kDate = await hmacRaw(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, service);
  return hmacRaw(kService, 'aws4_request');
}

function formatAmzDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

function encodeR2ObjectKeyForPath(key: string): string {
  return key
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/\+/g, '%20'))
    .join('/');
}

export type PresignR2GetParams = {
  accountId: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds: number;
};

export async function presignR2GetUrl(p: PresignR2GetParams): Promise<string> {
  const region = 'auto';
  const service = 's3';
  const host = `${p.accountId}.r2.cloudflarestorage.com`;
  const amzDate = formatAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);

  const credential = `${p.accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${p.bucket}/${encodeR2ObjectKeyForPath(p.key)}`;

  const qp = new Map<string, string>([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', credential],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.floor(p.expiresInSeconds))],
    ['X-Amz-SignedHeaders', 'host'],
  ]);

  const canonicalQueryString = [...qp.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hashedCanonicalRequest].join(
    '\n',
  );

  const signingKey = await getSignatureKey(p.secretAccessKey, dateStamp, region, service);
  const sigBytes = await hmacRaw(signingKey, stringToSign);
  const signature = [...sigBytes].map((b) => b.toString(16).padStart(2, '0')).join('');

  const finalQs = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return `https://${host}${canonicalUri}?${finalQs}`;
}

export type PresignR2UploadPartParams = {
  accountId: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds: number;
  uploadId: string;
  partNumber: number;
};

/**
 * S3 UploadPart 预签名 PUT（R2 兼容），供前端直传分片。
 * @see https://docs.aws.amazon.com/AmazonS3/latest/API/API_UploadPart.html
 */
export async function presignR2UploadPartUrl(p: PresignR2UploadPartParams): Promise<string> {
  const region = 'auto';
  const service = 's3';
  const host = `${p.accountId}.r2.cloudflarestorage.com`;
  const amzDate = formatAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);

  const credential = `${p.accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${p.bucket}/${encodeR2ObjectKeyForPath(p.key)}`;

  const qp = new Map<string, string>([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', credential],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.floor(p.expiresInSeconds))],
    ['X-Amz-SignedHeaders', 'host'],
    ['partNumber', String(p.partNumber)],
    ['uploadId', p.uploadId],
  ]);

  const canonicalQueryString = [...qp.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hashedCanonicalRequest].join(
    '\n',
  );

  const signingKey = await getSignatureKey(p.secretAccessKey, dateStamp, region, service);
  const sigBytes = await hmacRaw(signingKey, stringToSign);
  const signature = [...sigBytes].map((b) => b.toString(16).padStart(2, '0')).join('');

  const finalQs = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return `https://${host}${canonicalUri}?${finalQs}`;
}
