// Loaded with `--import` before the app so instrumented modules (http, express, pg, ioredis)
// are patched on first import. Keep this file free of app imports.
import { shutdownOnSignals, shutdownTelemetry, startTelemetry } from '@repo/telemetry';

// Endpoint and resource overrides come from the standard OTEL_* env vars.
startTelemetry({ serviceName: 'api', serviceVersion: process.env.npm_package_version });

// server.ts owns graceful shutdown and should call shutdownTelemetry() as its final step;
// this flushes on SIGTERM/SIGINT if it does not.
shutdownOnSignals(shutdownTelemetry);
