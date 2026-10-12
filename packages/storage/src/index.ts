import {
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchBucket,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageOptions {
  bucket: string;
  /** S3-compatible endpoint, e.g. http://localhost:9000 for MinIO. Omit for AWS S3. */
  endpoint?: string;
  /**
   * Endpoint used in presigned URLs, if clients reach storage on a different host than the
   * service does (e.g. service → http://minio:9000, mobile app → https://cdn.example.com).
   */
  publicEndpoint?: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Path-style URLs (`host/bucket/key`). Required for MinIO; defaults to true. */
  forcePathStyle?: boolean;
}

export interface Storage {
  readonly bucket: string;
  readonly client: S3Client;
  /** Presigned PUT URL. The uploader must send the same Content-Type header. */
  getUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;
  /** Presigned GET URL. */
  getDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  putObject(key: string, body: PutObjectCommandInput['Body'], contentType?: string): Promise<void>;
  /** Creates the bucket if it does not exist. Idempotent. */
  ensureBucket(): Promise<void>;
  destroy(): void;
}

const DEFAULT_EXPIRES_IN = 15 * 60;
const SIGNABLE_HEADERS = new Set(['content-type']);

export function createStorage(options: StorageOptions): Storage {
  const makeClient = (endpoint: string | undefined) =>
    new S3Client({
      endpoint,
      region: options.region ?? 'us-east-1',
      forcePathStyle: options.forcePathStyle ?? true,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      // Newer SDKs add CRC32 checksums by default; on presigned PUTs that bakes a checksum of
      // an empty body into the URL. Only send checksums when an operation requires them.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

  const client = makeClient(options.endpoint);
  const signer = options.publicEndpoint ? makeClient(options.publicEndpoint) : client;
  const { bucket } = options;

  return {
    bucket,
    client,

    getUploadUrl(key, contentType, expiresIn = DEFAULT_EXPIRES_IN) {
      return getSignedUrl(
        signer,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
        { expiresIn, signableHeaders: SIGNABLE_HEADERS },
      );
    },

    getDownloadUrl(key, expiresIn = DEFAULT_EXPIRES_IN) {
      return getSignedUrl(signer, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn,
      });
    },

    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        return;
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
      // Another instance may create it between HEAD and CREATE.
      await client.send(new CreateBucketCommand({ Bucket: bucket })).catch((error: unknown) => {
        if (!(error instanceof BucketAlreadyOwnedByYou || error instanceof BucketAlreadyExists)) {
          throw error;
        }
      });
    },

    destroy() {
      client.destroy();
      if (signer !== client) signer.destroy();
    },
  };
}

function isNotFound(error: unknown): boolean {
  // HEAD responses have no body, so the SDK may only give a bare 404 service exception.
  return (
    error instanceof NotFound ||
    error instanceof NoSuchBucket ||
    (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
  );
}
