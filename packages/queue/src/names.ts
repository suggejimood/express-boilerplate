export const QUEUE_NAMES = {
  generation: 'generation',
  notification: 'notification',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
