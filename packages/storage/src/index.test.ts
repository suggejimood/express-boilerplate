import { describe, expect, it } from 'vitest';
import { createStorage } from './index.js';

const storage = createStorage({
  bucket: 'images',
  endpoint: 'http://minio:9000',
  publicEndpoint: 'http://localhost:9000',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
});

describe('presigned URLs', () => {
  it('builds a path-style upload URL on the public endpoint', async () => {
    const url = new URL(await storage.getUploadUrl('users/u1/a.png', 'image/png', 60));
    expect(url.origin).toBe('http://localhost:9000');
    expect(url.pathname).toBe('/images/users/u1/a.png');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
  });

  it('builds a download URL with the default expiry', async () => {
    const url = new URL(await storage.getDownloadUrl('users/u1/a.png'));
    expect(url.pathname).toBe('/images/users/u1/a.png');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
  });

  it('uses the internal endpoint for direct calls', async () => {
    const endpoint = await storage.client.config.endpoint?.();
    expect(endpoint?.hostname).toBe('minio');
  });
});
