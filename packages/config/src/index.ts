import { z } from 'zod';

/**
 * Reusable env fragments (zod shapes). Compose them into a schema:
 * `createEnv(z.object({ ...baseEnv, ...port(3001), ...databaseUrl }))`
 */
export const nodeEnv = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
};

export const logLevel = {
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
};

export const port = (defaultPort: number) => ({
  PORT: z.coerce.number().int().min(1).max(65_535).default(defaultPort),
});

export const databaseUrl = {
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
};

export const redisUrl = {
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
};

export const otelEndpoint = {
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().default('http://localhost:4318'),
};

/** Fields every service needs. */
export const baseEnv = { ...nodeEnv, ...logLevel, ...otelEndpoint };

/**
 * Validates process.env and returns a typed, frozen object. On failure, prints which
 * variables are invalid and why, then exits the process with code 1.
 */
export function createEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  source: Record<string, string | undefined> = process.env,
): Readonly<z.infer<TSchema>> {
  const result = schema.safeParse(source);
  if (!result.success) {
    console.error(`❌ Invalid environment variables:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return Object.freeze(result.data);
}

export { z };
