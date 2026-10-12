import { z } from '../openapi.js';

/** Example contract. Domain schemas (users, credits, generations, ...) go next to it. */
export const healthResponseSchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    service: z.string(),
    uptime: z.number().nonnegative().openapi({ description: 'Process uptime in seconds' }),
  })
  .openapi('HealthResponse');

export type HealthResponse = z.infer<typeof healthResponseSchema>;
