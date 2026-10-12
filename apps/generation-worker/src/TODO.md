# generation-worker — senin yazacakların

Port **3002** (sadece health HTTP). `generation` kuyruğunu tüketir: AI görseli üretir, sonucu
storage'a koyar, DB'yi günceller, `notification` kuyruğuna olay yollar. `instrumentation.ts` hazır.

## Dosyalar

| Dosya                        | Sorumluluk                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/env.ts`                 | `createEnv(z.object({ ...baseEnv, ...port(3002), ...databaseUrl, ...redisUrl, GENERATION_CONCURRENCY, S3_* }))`.                                                                                                                                                                                                                                     |
| `src/db.ts`                  | api ile aynı şema (bkz. `apps/api/src/TODO.md` → `@repo/db` önerisi). Migration ÇALIŞTIRMA.                                                                                                                                                                                                                                                          |
| `src/handlers/generation.ts` | `JobHandler<'generation'>`: `generationId` ile kaydı oku → durum `processing` → sağlayıcıyı çağır → `storage.putObject(key, bytes, 'image/png')` → `completed` + `resultKey` → `notification` job'ı. Hata: son denemede (`job.attemptsMade + 1 >= job.opts.attempts`) `failed` + **kredi iadesi** (tek transaction) + `generation.failed` bildirimi. |
| `src/providers/*.ts`         | AI sağlayıcı arayüzü (`generate(prompt) → Buffer`) + local geliştirme için sahte sağlayıcı. `signal` (AbortSignal) parametresini sağlayıcıya geçir.                                                                                                                                                                                                  |
| `src/health.ts`              | Minimal Express: `GET /health` (canlı), `GET /ready` (pg + redis + `worker.isRunning()`).                                                                                                                                                                                                                                                            |
| `src/server.ts`              | `createWorker('generation', handler, { connection, concurrency })` + health server. Kapanış: `worker.close()` (aktif job'ları bitirir) → health `server.close()` → `pool.end()` → `redis.quit()` → `shutdownTelemetry()`.                                                                                                                            |
| `src/**/*.test.ts`           | Handler'ı fake repo/storage/queue ile test et (idempotency: aynı job ikinci kez gelirse `completed` kaydı tekrar işlenmesin).                                                                                                                                                                                                                        |

## Kullanacağın paketler

- `@repo/queue` — `createRedisConnection`, `createWorker('generation', ...)`, `createQueue('notification', ...)`, `JobHandler`, `TypedJob`. Payload worker'a gelmeden zod ile doğrulanır; bozuk payload `UnrecoverableError` ile retry'sız düşer. Trace context bullmq-otel ile producer'dan (api) otomatik gelir.
- `@repo/storage` — `createStorage(...)`, `putObject`
- `@repo/config`, `@repo/logger`, `@repo/telemetry` (`shutdownTelemetry`)
- npm: `bullmq`, `drizzle-orm`, `pg`, `express` (sadece health)

## Notlar

- At-least-once teslimat: handler idempotent olmalı (durum makinesi + `where status = ...` ile koşullu update).
- Varsayılan job ayarları `@repo/queue`'da: 3 deneme, exponential backoff (1s, 2s, 4s).
