import { randomUUID } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createQueue, createRedisConnection, createWorker } from './index.js';
import type { GenerationJob } from './index.js';

// Requires a running Redis: `pnpm infra:up` (REDIS_URL defaults to localhost:6379).
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('queue against real Redis', () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const connection = createRedisConnection(REDIS_URL);
  const prefix = `test-${randomUUID()}`;

  beforeAll(() => provider.register());
  afterAll(async () => {
    const keys = await connection.keys(`${prefix}:*`);
    if (keys.length) await connection.del(...keys);
    await connection.quit();
    await provider.shutdown();
  });

  it('processes a job and carries the producer trace into the worker', async () => {
    const queue = createQueue('generation', { connection, prefix });
    const generationId = randomUUID();

    let seen: { data: GenerationJob; traceId: string | undefined } | undefined;
    const processed = new Promise<void>((resolve, reject) => {
      const worker = createWorker(
        'generation',
        async (data) => {
          seen = { data, traceId: trace.getActiveSpan()?.spanContext().traceId };
          return { ok: true };
        },
        { connection, prefix },
      );
      worker.on('completed', () => void worker.close().then(resolve));
      worker.on('failed', (_job, error) => reject(error));
    });

    const tracer = trace.getTracer('queue-test');
    const producerTraceId = await tracer.startActiveSpan('http.request', async (span) => {
      await queue.add({ generationId });
      span.end();
      return span.spanContext().traceId;
    });

    await processed;
    await queue.close();

    expect(seen?.data).toEqual({ generationId });
    expect(seen?.traceId).toBe(producerTraceId);

    const spans = exporter.getFinishedSpans();
    const kinds = spans
      .filter((s) => s.spanContext().traceId === producerTraceId)
      .map((s) => s.name);
    expect(kinds.some((name) => name.startsWith('add'))).toBe(true);
    expect(kinds.some((name) => name.startsWith('process'))).toBe(true);
  });

  it('fails invalid payloads without retrying', async () => {
    const queue = createQueue('generation', { connection, prefix });
    const failed = new Promise<{ attemptsMade: number; message: string }>((resolve) => {
      const worker = createWorker('generation', async () => 'never', { connection, prefix });
      worker.on('failed', (job, error) => {
        void worker
          .close()
          .then(() => resolve({ attemptsMade: job?.attemptsMade ?? -1, message: error.message }));
      });
    });

    // Bypass producer validation to simulate a malformed message.
    await queue.queue.add('generation', { generationId: 'not-a-uuid' });
    const result = await failed;
    await queue.close();

    expect(result.message).toContain('Invalid generation job payload');
    expect(result.attemptsMade).toBe(1);
  });
});
