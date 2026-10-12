import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseEnv, createEnv, databaseUrl, port, redisUrl, z } from './index.js';

const schema = z.object({ ...baseEnv, ...port(3001), ...databaseUrl, ...redisUrl });
const valid = {
  DATABASE_URL: 'postgres://app:app@localhost:5432/app_db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('env fragments', () => {
  it('apply defaults and coerce types', () => {
    expect(schema.parse(valid)).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      PORT: 3001,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    });
    expect(schema.parse({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('reject non-postgres database URLs', () => {
    expect(schema.safeParse({ ...valid, DATABASE_URL: 'mysql://x' }).success).toBe(false);
  });
});

describe('createEnv', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns a frozen, typed object', () => {
    const env = createEnv(z.object({ ...port(1234), JWT_SECRET: z.string().min(32) }), {
      JWT_SECRET: 'x'.repeat(32),
    });
    expect(env).toEqual({ PORT: 1234, JWT_SECRET: 'x'.repeat(32) });
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('names every invalid variable and exits with code 1', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createEnv(schema, { DATABASE_URL: 'mysql://x', REDIS_URL: 'redis://localhost', PORT: 'abc' });

    expect(exit).toHaveBeenCalledWith(1);
    const message = String(error.mock.calls[0]?.[0]);
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('PORT');
    expect(message).not.toContain('REDIS_URL');
  });
});
