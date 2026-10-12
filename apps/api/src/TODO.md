# api — senin yazacakların

Port **3001**. Kullanıcı, kredi ve üretim (generation) endpoint'leri; Drizzle + Postgres; `generation`
kuyruğuna job üretir. `instrumentation.ts`, `drizzle.config.ts` hazır.

## Dosyalar

| Dosya                          | Sorumluluk                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/env.ts`                   | `createEnv(z.object({ ...baseEnv, ...port(3001), ...databaseUrl, ...redisUrl, S3_* }))`.                                                                                                                         |
| `src/db/schema.ts`             | Drizzle şeması (`pgTable`): users, credit_ledger / balances, generations (status: `queued → processing → completed / failed`), idempotency key. `drizzle.config.ts` bu yolu bekliyor.                            |
| `src/db/client.ts`             | `new pg.Pool({ connectionString })` + `drizzle(pool, { schema })`. pg instrumentation sorguları otomatik span'liyor.                                                                                             |
| `src/app.ts`                   | `createApp(deps)` (listen yok). `express.json()`, `GET /health`, `GET /ready` (pg `select 1` + redis `ping`), `/v1` router'ları, `/docs` (swagger-ui-express), error handler.                                    |
| `src/server.ts`                | Bağımlılıkları kur, `storage.ensureBucket()`, `listen`. Kapanış: `server.close()` → `queue.close()` → `pool.end()` → `redis.quit()` → `shutdownTelemetry()`.                                                     |
| `src/routes/*.ts`              | users, credits, generations. Request body/params/response'ları `@repo/contracts` şemalarıyla doğrula.                                                                                                            |
| `src/services/*.ts`            | İş kuralları. **Kredi düşümü + generation kaydı + outbox tek transaction'da**; job'ı commit'ten sonra kuyruğa ekle (ya da outbox). `jobId: generationId` ver: BullMQ aynı id'yi ikinci kez eklemez (idempotent). |
| `src/repositories/*.ts`        | Drizzle sorguları; servisler SQL bilmesin.                                                                                                                                                                       |
| `src/openapi.ts`               | `registry.registerPath(...)` + `generateOpenApiDocument({ info: { title, version } })` → `/docs` ve `/openapi.json`.                                                                                             |
| `src/**/*.test.ts`             | supertest ile route testleri (fake repo/queue).                                                                                                                                                                  |
| `src/**/*.integration.test.ts` | `@testcontainers/postgresql` + `@testcontainers/redis` ile gerçek DB/Redis; migration'ları container'a uygula. `pnpm test:integration`.                                                                          |

## Kullanacağın paketler

- `@repo/config`, `@repo/logger`, `@repo/telemetry` (`shutdownTelemetry`)
- `@repo/queue` — `createRedisConnection`, `createQueue('generation', { connection })`, `GenerationJob`
- `@repo/storage` — `createStorage(...)`, `getUploadUrl` (kullanıcı referans görseli yükler), `getDownloadUrl` (sonuç)
- `@repo/contracts` — `z` (`.openapi()` destekli), `registry`, `generateOpenApiDocument`; domain şemalarını buraya ekle
- npm: `express`, `drizzle-orm`, `pg`, `bullmq`, `swagger-ui-express`

## Komutlar

- `pnpm --filter api db:generate` — şemadan SQL migration üretir (`apps/api/drizzle/`)
- `pnpm --filter api db:migrate` — migration'ları `DATABASE_URL`'e uygular

## Şemayı generation-worker ile paylaşma önerisi

`generation-worker` aynı DB'deki `generations` (ve kredi iadesi için ledger) tablolarına yazacak. Öneri:

1. Şemayı yeni bir JIT paketine taşı: **`packages/db`** (`@repo/db`) → `src/schema.ts` + `src/client.ts`
   (`createDb(url)` → `{ db, pool }`). Paket build'siz, `exports: { ".": "./src/index.ts" }`, diğerleri gibi.
2. `api` ve `generation-worker` `@repo/db`'ye `workspace:*` ile bağlanır; tsup ikisinin bundle'ına da gömer.
3. **Migration'ların sahibi tek servis (api)** kalsın: `drizzle.config.ts`'te
   `schema: '../../packages/db/src/schema.ts'`; worker asla migrate çalıştırmaz. Deploy sırası: önce
   migrate, sonra servisler; şema değişiklikleri geriye uyumlu (expand → contract).
4. Neden app'ten app'e import değil: `generation-worker`'ın `api`'ye bağımlı olması `turbo prune`
   çıktısına tüm api'yi sokar ve sınırları bulandırır; ortak paket bağımlılığı tek yönde tutar.
5. Kısa vadede taşımak istemezsen: `src/db/schema.ts`'i api'de tut ama dışarıya hiçbir şey export etme;
   worker yalnızca ihtiyaç duyduğu tabloları kendi şemasında tanımlasın. (Tekrar = kayma riski, bu yüzden
   1. seçenek tercih.)
