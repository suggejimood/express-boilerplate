import { describe, expect, it } from 'vitest';
import { createInstrumentations, instrumentedModuleNames } from './instrumentations.js';

describe('createInstrumentations', () => {
  const instrumentations = createInstrumentations();
  const names = instrumentations.map((i) => i.instrumentationName);

  it('includes http, express, pg and ioredis', () => {
    expect(names).toEqual(
      expect.arrayContaining([
        '@opentelemetry/instrumentation-http',
        '@opentelemetry/instrumentation-express',
        '@opentelemetry/instrumentation-pg',
        '@opentelemetry/instrumentation-ioredis',
      ]),
    );
  });

  it('disables fs, dns and net', () => {
    expect(names).not.toContain('@opentelemetry/instrumentation-fs');
    expect(names).not.toContain('@opentelemetry/instrumentation-dns');
    expect(names).not.toContain('@opentelemetry/instrumentation-net');
  });

  it('collects the module names to hook in the ESM loader', () => {
    const modules = instrumentedModuleNames(instrumentations);
    expect(modules).toEqual(expect.arrayContaining(['http', 'express', 'pg', 'ioredis']));
    expect(modules).not.toContain('fs');
  });
});
