import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createStorage } from './index.js';

// Requires MinIO: `pnpm infra:up`.
const storage = createStorage({
  bucket: `test-${randomUUID().slice(0, 8)}`,
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
});

describe('storage against MinIO', () => {
  afterAll(() => storage.destroy());

  it('creates the bucket idempotently', async () => {
    await storage.ensureBucket();
    await storage.ensureBucket();
  });

  it('uploads with a presigned PUT and downloads with a presigned GET', async () => {
    const key = `uploads/${randomUUID()}.txt`;
    const body = 'hello from presigned url';

    const uploadUrl = await storage.getUploadUrl(key, 'text/plain', 60);
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body,
    });
    expect(put.status).toBe(200);

    const download = await fetch(await storage.getDownloadUrl(key, 60));
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('text/plain');
    expect(await download.text()).toBe(body);
  });

  it('rejects an upload whose content type differs from the signed one', async () => {
    const uploadUrl = await storage.getUploadUrl(`uploads/${randomUUID()}.png`, 'image/png', 60);
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'text/html' },
      body: '<script>',
    });
    expect(put.status).toBe(403);
  });

  it('puts an object directly', async () => {
    const key = `generated/${randomUUID()}.json`;
    await storage.putObject(key, JSON.stringify({ ok: true }), 'application/json');
    const download = await fetch(await storage.getDownloadUrl(key));
    expect(await download.json()).toEqual({ ok: true });
  });
});
