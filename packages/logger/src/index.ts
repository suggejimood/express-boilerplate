import { isSpanContextValid, trace } from '@opentelemetry/api';
import { pino } from 'pino';
import type { DestinationStream, Level, Logger, LoggerOptions } from 'pino';

export type { Logger } from 'pino';

export interface CreateLoggerOptions {
  service: string;
  level?: Level | 'silent';
  /** Pretty-print with pino-pretty (dev dependency). Defaults to NODE_ENV === 'development'. */
  pretty?: boolean;
  /** Custom destination (tests). Ignored when `pretty` is enabled. */
  destination?: DestinationStream;
}

/**
 * Adds the active span's ids so log lines can be joined with traces (Loki ↔ Tempo).
 * Returns a fresh object every call: pino merges the log arguments into it.
 */
export function traceMixin(): Record<string, string> {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !isSpanContextValid(spanContext)) return {};
  return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const pretty = options.pretty ?? process.env.NODE_ENV === 'development';
  const config: LoggerOptions = {
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    base: { service: options.service },
    mixin: traceMixin,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
      censor: '[redacted]',
    },
  };

  if (pretty) {
    return pino({
      ...config,
      // Keep numeric levels for pino-pretty; the string label is only for JSON output.
      formatters: {},
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    });
  }
  return options.destination ? pino(config, options.destination) : pino(config);
}
