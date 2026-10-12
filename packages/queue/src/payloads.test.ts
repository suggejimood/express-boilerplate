import { describe, expect, it } from 'vitest';
import {
  createRedisConnection,
  DEFAULT_JOB_OPTIONS,
  parseJobPayload,
  QUEUE_NAMES,
} from './index.js';

describe('queue names', () => {
  it('exposes stable queue names', () => {
    expect(QUEUE_NAMES).toEqual({ generation: 'generation', notification: 'notification' });
  });
});

describe('job payloads', () => {
  it('accepts a generation job with a uuid', () => {
    const generationId = '8f14e45f-ceea-4672-9b8f-8c7b3a2e1d4c';
    expect(parseJobPayload('generation', { generationId })).toEqual({ generationId });
  });

  it('rejects a generation job without a uuid', () => {
    expect(() => parseJobPayload('generation', { generationId: '42' })).toThrow();
  });

  it('defaults notification data to an empty object', () => {
    expect(parseJobPayload('notification', { userId: 'u1', type: 'generation.completed' })).toEqual(
      {
        userId: 'u1',
        type: 'generation.completed',
        data: {},
      },
    );
  });

  it('rejects unknown notification types', () => {
    expect(() =>
      parseJobPayload('notification', { userId: 'u1', type: 'nope', data: {} }),
    ).toThrow();
  });
});

describe('defaults', () => {
  it('retries 3 times with exponential backoff', () => {
    expect(DEFAULT_JOB_OPTIONS).toMatchObject({ attempts: 3, backoff: { type: 'exponential' } });
  });

  it('creates a BullMQ-compatible redis connection', () => {
    const redis = createRedisConnection('redis://localhost:6379', { lazyConnect: true });
    expect(redis.options.maxRetriesPerRequest).toBeNull();
    redis.disconnect();
  });
});
