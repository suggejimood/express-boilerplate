import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';

/**
 * ioredis client for BullMQ. `maxRetriesPerRequest: null` is required by BullMQ workers
 * (blocking commands must not be retried/failed by ioredis itself).
 */
export function createRedisConnection(url: string, options: RedisOptions = {}): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, ...options });
}
