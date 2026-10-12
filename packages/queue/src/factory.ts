import { Queue, UnrecoverableError, Worker } from 'bullmq';
import type { DefaultJobOptions, Job, JobsOptions, Telemetry, WorkerOptions } from 'bullmq';
import { BullMQOtel } from 'bullmq-otel';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { QueueName } from './names.js';
import { parseJobPayload } from './payloads.js';
import type { JobInput, JobPayload } from './payloads.js';

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { count: 1_000, age: 24 * 60 * 60 },
  removeOnFail: { count: 5_000, age: 7 * 24 * 60 * 60 },
} as const satisfies DefaultJobOptions;

/**
 * BullMQ's official OpenTelemetry integration. Producer spans inject the active context into
 * the job; the worker restores it, so the consumer span joins the producer's trace.
 * Shared per process: every instance would register its own meter instruments.
 */
let defaultTelemetry: Telemetry | undefined;

function resolveTelemetry(telemetry: Telemetry | false | undefined): Telemetry | undefined {
  if (telemetry === false) return undefined;
  return (
    telemetry ??
    (defaultTelemetry ??= new BullMQOtel({
      tracerName: '@repo/queue',
      meterName: '@repo/queue',
      enableMetrics: true,
    }))
  );
}

export interface CreateQueueOptions {
  connection: Redis;
  defaultJobOptions?: DefaultJobOptions;
  /** Defaults to BullMQOtel. Pass `false` to disable tracing. */
  telemetry?: Telemetry | false;
  prefix?: string;
}

export type TypedJob<N extends QueueName, R = unknown> = Job<JobPayload<N>, R, N>;

// BullMQ derives data/name types through conditional generics, which stay unresolved for a
// generic N unless every parameter is spelled out.
type TypedBullQueue<N extends QueueName> = Queue<
  JobPayload<N>,
  unknown,
  N,
  JobPayload<N>,
  unknown,
  N
>;

export interface TypedQueue<N extends QueueName> {
  readonly name: N;
  /** Underlying BullMQ queue, for counts, pausing, cleaning, etc. */
  readonly queue: TypedBullQueue<N>;
  /** Validates the payload against the queue schema, then enqueues it. */
  add(data: JobInput<N>, options?: JobsOptions): Promise<TypedJob<N>>;
  close(): Promise<void>;
}

export function createQueue<N extends QueueName>(
  name: N,
  options: CreateQueueOptions,
): TypedQueue<N> {
  const queue: TypedBullQueue<N> = new Queue(name, {
    connection: options.connection,
    prefix: options.prefix,
    telemetry: resolveTelemetry(options.telemetry),
    defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, ...options.defaultJobOptions },
  });

  return {
    name,
    queue,
    add: (data, jobOptions) => queue.add(name, parseJobPayload(name, data), jobOptions),
    close: () => queue.close(),
  };
}

export type JobHandler<N extends QueueName, R = unknown> = (
  data: JobPayload<N>,
  job: TypedJob<N, R>,
  signal?: AbortSignal,
) => Promise<R>;

export type CreateWorkerOptions = Omit<WorkerOptions, 'connection' | 'telemetry'> & {
  connection: Redis;
  /** Defaults to BullMQOtel. Pass `false` to disable tracing. */
  telemetry?: Telemetry | false;
};

/**
 * Typed worker. Job data is validated before the handler runs; an invalid payload fails the job
 * with UnrecoverableError (no retries — retrying cannot fix a malformed message).
 */
export function createWorker<N extends QueueName, R = unknown>(
  name: N,
  handler: JobHandler<N, R>,
  options: CreateWorkerOptions,
): Worker<JobPayload<N>, R, N> {
  const { telemetry, ...workerOptions } = options;
  return new Worker<JobPayload<N>, R, N>(
    name,
    async (job, _token, signal) => {
      let data: JobPayload<N>;
      try {
        data = parseJobPayload(name, job.data);
      } catch (error) {
        if (!(error instanceof z.ZodError)) throw error;
        throw new UnrecoverableError(`Invalid ${name} job payload: ${z.prettifyError(error)}`);
      }
      return handler(data, job, signal);
    },
    { ...workerOptions, telemetry: resolveTelemetry(telemetry) },
  );
}
