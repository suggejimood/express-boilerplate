import { afterEach, describe, expect, it, vi } from 'vitest';
import { shutdownOnSignals } from './signals.js';

describe('shutdownOnSignals', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('flushes and exits when the app has no handler', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const shutdown = vi.fn(async () => {});
    shutdownOnSignals(shutdown, { signals: ['SIGUSR2'] });

    process.emit('SIGUSR2', 'SIGUSR2');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it('defers to the app handler and only arms a fallback', () => {
    vi.useFakeTimers();
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const shutdown = vi.fn(async () => {});
    const appHandler = vi.fn();
    shutdownOnSignals(shutdown, { signals: ['SIGUSR2'], fallbackMs: 1_000 });
    process.on('SIGUSR2', appHandler);

    process.emit('SIGUSR2', 'SIGUSR2');
    expect(appHandler).toHaveBeenCalledOnce();
    expect(shutdown).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(shutdown).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    process.off('SIGUSR2', appHandler);
  });
});
