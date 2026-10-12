import { z } from 'zod';
import type { QueueName } from './names.js';

export const generationJobSchema = z.object({
  generationId: z.uuid(),
});

export const notificationTypeSchema = z.enum(['generation.completed', 'generation.failed']);

export const notificationJobSchema = z.object({
  userId: z.string().min(1),
  type: notificationTypeSchema,
  data: z.record(z.string(), z.unknown()).default({}),
});

export const jobSchemas = {
  generation: generationJobSchema,
  notification: notificationJobSchema,
} satisfies Record<QueueName, z.ZodType>;

/** Payload as consumed by the worker (defaults applied). */
export type JobPayload<N extends QueueName> = z.output<(typeof jobSchemas)[N]>;
/** Payload as accepted by the producer (defaults optional). */
export type JobInput<N extends QueueName> = z.input<(typeof jobSchemas)[N]>;

export type GenerationJob = JobPayload<'generation'>;
export type NotificationJob = JobPayload<'notification'>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export function parseJobPayload<N extends QueueName>(name: N, data: unknown): JobPayload<N> {
  return jobSchemas[name].parse(data) as JobPayload<N>;
}
