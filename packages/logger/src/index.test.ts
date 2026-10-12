import { Writable } from 'node:stream';
import { context, trace, TraceFlags } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger, traceMixin } from './index.js';

function capture() {
  const lines: Array<Record<string, unknown>> = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  return { lines, destination };
}

const spanContext = {
  traceId: '0af7651916cd43dd8448eb211c80319c',
  spanId: 'b7ad6b7169203331',
  traceFlags: TraceFlags.SAMPLED,
};

describe('createLogger', () => {
  const contextManager = new AsyncLocalStorageContextManager();
  beforeAll(() => context.setGlobalContextManager(contextManager.enable()));
  afterAll(() => {
    contextManager.disable();
    context.disable();
  });

  it('adds service name and string level', () => {
    const { lines, destination } = capture();
    createLogger({ service: 'api', pretty: false, destination }).info({ userId: 'u1' }, 'hello');
    expect(lines[0]).toMatchObject({ service: 'api', level: 'info', msg: 'hello', userId: 'u1' });
    expect(lines[0]).not.toHaveProperty('trace_id');
  });

  it('adds trace_id and span_id of the active span', () => {
    const { lines, destination } = capture();
    const logger = createLogger({ service: 'api', pretty: false, destination });
    const ctx = trace.setSpan(context.active(), trace.wrapSpanContext(spanContext));
    context.with(ctx, () => logger.info('inside span'));
    expect(lines[0]).toMatchObject({
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
    });
  });

  it('redacts secrets', () => {
    const { lines, destination } = capture();
    createLogger({ service: 'api', pretty: false, destination }).info({ user: { password: 'p' } });
    expect(lines[0]).toMatchObject({ user: { password: '[redacted]' } });
  });

  it('traceMixin returns nothing without an active span', () => {
    expect(traceMixin()).toEqual({});
  });
});
