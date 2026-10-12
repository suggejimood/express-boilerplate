export interface ShutdownOnSignalsOptions {
  signals?: NodeJS.Signals[];
  /**
   * When the app has its own signal handler (graceful HTTP/worker drain), it is expected to call
   * shutdownTelemetry() as its last step. This is a fallback in case it never does.
   */
  fallbackMs?: number;
}

/**
 * Flushes telemetry on SIGTERM/SIGINT.
 *
 * - No app handler for the signal → flush, then exit (Node would otherwise not exit, since
 *   adding a listener replaces the default behaviour).
 * - App handler present → the app owns shutdown order (drain first, flush last); only arm an
 *   unref'd fallback so spans are not lost if the app forgets.
 */
export function shutdownOnSignals(
  shutdown: () => Promise<void>,
  { signals = ['SIGTERM', 'SIGINT'], fallbackMs = 10_000 }: ShutdownOnSignalsOptions = {},
): () => void {
  const off = () => {
    for (const s of signals) process.off(s, handler);
  };
  const handler = (signal: NodeJS.Signals) => {
    off();
    if (process.listenerCount(signal) === 0) {
      void shutdown()
        .catch((error: unknown) => console.error('Telemetry shutdown failed', error))
        .finally(() => process.exit(0));
      return;
    }
    setTimeout(() => void shutdown(), fallbackMs).unref();
  };
  for (const s of signals) process.on(s, handler);
  return off;
}
