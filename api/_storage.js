// api/_storage.js — Alpha Quantum ERP v15 — S3/Cloudflare R2 Storage
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

let _s3 = null;

function getS3() {
  if (_s3) return _s3;
  const accountId = process.env.CF_ACCOUNT_ID;
  const accessKey = process.env.CF_ACCESS_KEY_ID;
  const secretKey = process.env.CF_SECRET_ACCESS_KEY;

  if (!accountId || !accessKey || !secretKey) {
    throw new Error('Cloudflare R2 credentials not configured. Set CF_ACCOUNT_ID, CF_ACCESS_KEY_ID, CF_SECRET_ACCESS_KEY');
  }

  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  return _s3;
}

export async function uploadFile(fileBuffer, fileName, mimeType, folder = 'uploads') {
  const s3 = getS3();
  const bucket = process.env.CF_R2_BUCKET || 'alpha-erp-uploads';
  const ext = fileName.split('.').pop() || 'bin';
  const key = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
    CacheControl: 'public, max-age=31536000',
  }));

  const publicUrl = process.env.CF_R2_PUBLIC_URL
    ? `${process.env.CF_R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
    : `https://${bucket}.r2.dev/${key}`;

  return { key, url: publicUrl };
}

export async function deleteFile(key) {
  try {
    const s3 = getS3();
    const bucket = process.env.CF_R2_BUCKET || 'alpha-erp-uploads';
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    console.warn('Delete file warn:', e.message);
  }
}

export async function getPresignedUploadUrl(fileName, mimeType, folder = 'uploads') {
  const s3 = getS3();
  const bucket = process.env.CF_R2_BUCKET || 'alpha-erp-uploads';
  const ext = fileName.split('.').pop() || 'bin';
  const key = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

  const url = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: mimeType,
  }), { expiresIn: 3600 });

  const publicUrl = process.env.CF_R2_PUBLIC_URL
    ? `${process.env.CF_R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
    : `https://${bucket}.r2.dev/${key}`;

  return { uploadUrl: url, key, publicUrl };
}

// Parse multipart form data for file uploads (serverless-compatible)
export function parseBase64Upload(body) {
  // Expects { file: base64string, filename: string, mimetype: string }
  const { file, filename, mimetype } = body;
  if (!file || !filename || !mimetype) throw new Error('Missing file, filename, or mimetype');
  const buffer = Buffer.from(file.replace(/^data:[^;]+;base64,/, ''), 'base64');
  return { buffer, filename, mimetype };
}
