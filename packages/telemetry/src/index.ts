// Ambient shim must travel with this JIT package to every consumer, so an import cannot replace it.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./import-in-the-middle.d.ts" />
import { register as registerEsmHooks } from 'import-in-the-middle/register-hooks.mjs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { createInstrumentations, instrumentedModuleNames } from './instrumentations.js';

export { createInstrumentations, instrumentedModuleNames } from './instrumentations.js';
export { shutdownOnSignals } from './signals.js';
export type { ShutdownOnSignalsOptions } from './signals.js';

export interface TelemetryOptions {
  serviceName: string;
  serviceVersion?: string;
  /** Metric export interval in ms. */
  metricIntervalMs?: number;
}

export interface Telemetry {
  shutdown: () => Promise<void>;
}

// Module state is shared by instrumentation.js and server.js because tsup emits this package
// into one chunk (ESM code splitting) and tsx loads it once in dev.
let current: Telemetry | undefined;

/**
 * Starts the OpenTelemetry Node SDK. Must run before any instrumented module (express, pg,
 * ioredis, http, ...) is imported, so load it with `node --import ./instrumentation.js`.
 *
 * Exporters follow the standard env vars (OTEL_EXPORTER_OTLP_ENDPOINT, per-signal
 * *_ENDPOINT, headers, ...); OTEL_SERVICE_NAME / OTEL_RESOURCE_ATTRIBUTES override the resource.
 */
export function startTelemetry(options: TelemetryOptions): Telemetry {
  if (current) return current;

  const instrumentations = createInstrumentations();
  // Synchronous in-thread ESM loader hooks (module.registerHooks). Needed because express/pg/
  // ioredis are imported from ESM; require-in-the-middle alone only sees require() calls.
  registerEsmHooks({ include: instrumentedModuleNames(instrumentations) });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion ?? '0.0.0',
      'deployment.environment.name': process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: options.metricIntervalMs ?? 15_000,
      }),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations,
  });

  sdk.start();

  let stopping: Promise<void> | undefined;
  current = {
    shutdown: () => {
      stopping ??= sdk.shutdown().finally(() => {
        current = undefined;
      });
      return stopping;
    },
  };
  return current;
}

/** Flushes and stops the SDK started by startTelemetry(), if any. Safe to call repeatedly. */
export async function shutdownTelemetry(): Promise<void> {
  await current?.shutdown();
}
