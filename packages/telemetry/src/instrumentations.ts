import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import type { Instrumentation } from '@opentelemetry/instrumentation';

/**
 * Auto-instrumentations used by every service.
 *
 * fs and dns are disabled (span noise on every file read / lookup). net is disabled too:
 * it only adds a `tcp.connect` span under each pg/redis/http connection.
 */
export function createInstrumentations(): Instrumentation[] {
  return getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false },
    '@opentelemetry/instrumentation-dns': { enabled: false },
    '@opentelemetry/instrumentation-net': { enabled: false },
    // @repo/logger's mixin owns trace_id/span_id on log lines; keep only the OTLP log bridge here.
    '@opentelemetry/instrumentation-pino': { disableLogCorrelation: true },
  });
}

/**
 * Module names the instrumentations want to patch. Passed to import-in-the-middle as an
 * allow-list so the ESM loader only wraps those modules instead of every import.
 */
export function instrumentedModuleNames(instrumentations: Instrumentation[]): string[] {
  const names = new Set<string>();
  for (const instrumentation of instrumentations) {
    if (!('getModuleDefinitions' in instrumentation)) continue;
    const definitions = (
      instrumentation as { getModuleDefinitions: () => Array<{ name: string }> }
    ).getModuleDefinitions();
    for (const definition of definitions) names.add(definition.name);
  }
  return [...names];
}
