# express-boilerplate

AI ile görsel üreten bir mobil uygulamanın backend iskeleti: kullanıcı, kredi, asenkron üretim ve
bildirim. TypeScript + Express 5, pnpm workspaces + Turborepo, ESM her yerde.

> Altyapı (paketler, konfigürasyon, Docker, telemetry) hazır. App'lerin Express/iş mantığı kodu
> henüz yok; her app'in `src/TODO.md` dosyası yazılacak dosyaları ve sorumluluklarını listeler.

## Mimari

```
 mobil app
    │  HTTPS (JWT)
    ▼
┌──────────┐  proxy  ┌──────────┐  enqueue   ┌───────────── Redis (BullMQ) ─────────────┐
│ gateway  │────────▶│   api    │───────────▶│ generation queue     notification queue  │
│  :8080   │         │  :3001   │            └──────┬───────────────────────▲──────┬────┘
└────┬─────┘         └──┬───┬───┘                   │ consume               │      │ consume
     │ rate limit       │   │ presigned URL  ┌──────▼────────────┐  enqueue  │  ┌───▼──────────┐
     ▼                  │   ▼                │ generation-worker │───────────┘  │ notification │
   Redis                │  MinIO (S3) ◀──────│      :3002        │              │    :3003     │
                        ▼                    └──────┬────────────┘              └──────────────┘
                     Postgres ◀─────────────────────┘
  Hepsi ── OTLP/HTTP ──▶ grafana/otel-lgtm (Tempo · Loki · Prometheus · Grafana :3000)
```

| Klasör                   | İçerik                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/gateway`           | Tek giriş noktası: JWT doğrulama (jose), rate limit (rate-limiter-flexible + Redis), `api`'ye proxy (http-proxy-middleware).                |
| `apps/api`               | Kullanıcı / kredi / üretim endpoint'leri, Drizzle + Postgres, `generation` kuyruğuna job üretir, OpenAPI + Swagger UI.                      |
| `apps/generation-worker` | `generation` kuyruğunu tüketir, görseli üretip storage'a koyar, `notification` job'ı üretir. Sadece health HTTP.                            |
| `apps/notification`      | `notification` kuyruğunu tüketir, kullanıcıya bildirim gönderir. Sadece health HTTP.                                                        |
| `packages/tsconfig`      | Ortak `base.json` (ES2024, NodeNext, strict, …).                                                                                            |
| `packages/config`        | `createEnv(schema)`: env'i zod ile doğrular; hatada hangi değişkenin neden geçersiz olduğunu yazıp çıkar. Ortak şema parçaları.             |
| `packages/logger`        | `createLogger({ service })`: pino; her satıra aktif span'in `trace_id` / `span_id`'si; dev'de pino-pretty.                                  |
| `packages/telemetry`     | `startTelemetry({ serviceName })`: OTel NodeSDK, OTLP HTTP (traces, metrics, logs), auto-instrumentations (fs/dns/net kapalı).              |
| `packages/queue`         | Kuyruk isimleri, zod'lu job payload'ları, `createRedisConnection`, tipli `createQueue` / `createWorker`, bullmq-otel ile trace propagation. |
| `packages/storage`       | S3 uyumlu istemci: `getUploadUrl`, `getDownloadUrl`, `putObject`, `ensureBucket`.                                                           |
| `packages/contracts`     | Servisler arası zod şemaları + OpenAPI registry ve `generateOpenApiDocument()`.                                                             |
| `infra/`                 | `docker-compose.yml` (postgres, redis, minio, otel-lgtm + `apps` profili), `postgres/init.sql`.                                             |

## Portlar

Ağa açık olan tek port gateway'inki. api ve worker'lar yalnızca compose ağı içinden erişilebilir
(`http://api:3001`). Altyapı portları sadece `127.0.0.1`'e bağlı: host'ta çalışan `pnpm dev`,
migration'lar ve integration testleri erişebilir, LAN erişemez.

| Servis                            | Port        | Erişim                          |
| --------------------------------- | ----------- | ------------------------------- |
| gateway                           | 8080        | dışarı açık (tek giriş noktası) |
| api                               | 3001        | sadece iç ağ                    |
| generation-worker (health)        | 3002        | sadece iç ağ                    |
| notification (health)             | 3003        | sadece iç ağ                    |
| Postgres                          | 5432        | `127.0.0.1`                     |
| Redis                             | 6379        | `127.0.0.1`                     |
| MinIO S3 API / Console            | 9000 / 9001 | `127.0.0.1`                     |
| Grafana (Tempo, Loki, Prometheus) | 3000        | `127.0.0.1`                     |
| OTLP gRPC / HTTP                  | 4317 / 4318 | `127.0.0.1`                     |

MinIO S3 API'si client'ların presigned URL ile doğrudan eriştiği yer (`S3_PUBLIC_ENDPOINT`);
production'da public bir storage/CDN host'unun arkasında olmalı. `pnpm dev` ile app'ler host'ta
çalışırken her biri kendi portunu kullanır (aynı makinede çakışmasınlar diye).

## Komutlar

Gereksinimler: Node 24 (`.nvmrc`), pnpm 11.28.5 (`devEngines` ile sabit), Docker.

```bash
cp .env.example .env   # tek env dosyası: tüm app'ler + Postgres + MinIO
pnpm install
pnpm infra:up          # postgres, redis, minio, otel-lgtm — healthy olana kadar bekler
pnpm dev               # tüm app'ler: tsx watch + --import ./src/instrumentation.ts
pnpm build             # tsup → apps/*/dist
pnpm typecheck
pnpm lint              # ESLint (flat config, typescript-eslint, type-aware değil)
pnpm test              # birim testleri (Vitest)
pnpm test:integration  # gerçek Redis/MinIO'ya karşı (önce infra:up)
pnpm format            # Prettier
pnpm infra:down

pnpm --filter api db:generate   # Drizzle migration üret (src/db/schema.ts'den)
pnpm --filter api db:migrate    # migration'ları uygula

# App'leri container olarak (kodları yazıldıktan sonra):
docker compose --env-file .env -f infra/docker-compose.yml --profile apps up -d --build
docker build --build-arg APP=api -t api .
```

Tek bir app: `pnpm --filter api dev`.

## Env değişkenleri

Hepsi kökteki **tek `.env`** dosyasında (`.env.example`'dan kopyala):

- Host'ta çalışan app'ler (`pnpm dev`) ve `drizzle-kit` dosyayı `--env-file` / `loadEnvFile` ile
  okur.
- Compose aynı dosyayı iki şekilde kullanır: Postgres ve MinIO kimlik bilgileri için değişken
  interpolasyonu (`--env-file .env`), app container'ları için `env_file`. Container'larda yalnızca
  adresler değişir (`localhost` → `postgres`, `redis`, `minio`, `lgtm`, `api`) ve `NODE_ENV=production`
  olur.
- `PORT` paylaşılan dosyada yok: her app kendi varsayılanını kullanır, compose ise servis başına
  verir.
- Not: tek dosya, her servisin her secret'ı görmesi demek. Local geliştirme için kabul edilebilir;
  production'da her servis yalnızca kendi secret'larını orkestratörden almalı.

| Değişken                                                                                                  | Kullanan                         | Örnek (`.env.example`)                     |
| --------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------ |
| `NODE_ENV`, `LOG_LEVEL`                                                                                   | hepsi                            | `development`, `debug`                     |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                                                       | Postgres container               | `app` / `app` / `app_db`                   |
| `DATABASE_URL`                                                                                            | api, generation-worker           | `postgres://app:app@localhost:5432/app_db` |
| `REDIS_URL`                                                                                               | hepsi                            | `redis://localhost:6379`                   |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`                                                                  | MinIO container                  | `minioadmin` / `minioadmin`                |
| `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | api, generation-worker           | MinIO değerleri                            |
| `OTEL_EXPORTER_OTLP_ENDPOINT` (+ standart `OTEL_*`)                                                       | hepsi                            | `http://localhost:4318`                    |
| `API_URL`                                                                                                 | gateway                          | `http://localhost:3001`                    |
| `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`                                                                | gateway                          | bkz. `.env.example`                        |
| `RATE_LIMIT_POINTS`, `RATE_LIMIT_DURATION_SECONDS`                                                        | gateway                          | 100 / 60                                   |
| `GENERATION_CONCURRENCY` / `NOTIFICATION_CONCURRENCY`                                                     | generation-worker / notification | 4 / 10                                     |
| `PORT`                                                                                                    | hepsi (compose verir)            | 8080 / 3001 / 3002 / 3003                  |

Ortak parçalar `@repo/config`'ten gelir (`baseEnv`, `port()`, `databaseUrl`, `redisUrl`, `otelEndpoint`).

## Neden böyle

**JIT (Just-in-Time) paketler.** `packages/*` build edilmez; `exports` doğrudan `./src/index.ts`'i
gösterir. Dev'de tsx, testte Vitest, typecheck'te tsc kaynağı doğrudan okur: paket değişince
yeniden build/watch yok, "go to definition" kaynağa gider, project references gerekmez. Production'da
app'in tsup'u `@repo/*`'u bundle'a gömer (`noExternal`), node_modules'tan gelen her şeyi external
bırakır (`skipNodeModulesBundle`). External bırakmak zorunlu: OTel instrumentation'ları `express`,
`pg`, `ioredis` gibi modülleri yüklenirken yamalar; bundle'a gömülen bir kopyayı göremez (OTel SDK'yı
bundle'lamak ayrıca runtime'da kırılıyor).
Bunun bir sonucu: bundle, `@repo/*`'un kendi bağımlılıklarını (pino, bullmq, `@opentelemetry/*`…)
isimle import eder. pnpm'in izole düzeninde bunlar app'in node_modules'ünde değildir; bu yüzden
Dockerfile `pnpm deploy --prod --config.node-linker=hoisted` ile düz bir node_modules üretir.
Sonuç: `start` script'i deploy edilmiş artifact (Docker image) içindir; lokal geliştirmede `pnpm dev`.

**`pg` (node-postgres), postgres.js değil.** `@opentelemetry/instrumentation-pg` her sorgu için span
(SQL, süre, hata) ve pool metrikleri üretir; postgres.js için resmi auto-instrumentation yok. Drizzle
ikisini de destekliyor, bu yüzden seçim gözlemlenebilirlik lehine.

**Kuyruk üzerinden trace propagation.** BullMQ'nun resmi telemetry entegrasyonu
([bullmq-otel](https://www.npmjs.com/package/bullmq-otel)) kullanılıyor: `Queue.add` bir PRODUCER
span'i açar ve aktif context'i job metadata'sına yazar; `Worker` onu geri yükleyip CONSUMER span'ini
aynı trace'e bağlar. Böylece `gateway → api → (Redis) → generation-worker → (Redis) → notification`
tek trace olarak Tempo'da görünür. Gerçek Redis'e karşı entegrasyon testi
(`packages/queue/src/queue.integration.test.ts`) worker içindeki trace id'nin producer'ınkiyle aynı
olduğunu doğruluyor; bu çalıştığı için job data'ya elle `traceparent` yazan helper'lara gerek
kalmadı. Payload'lar iki uçta da zod ile doğrulanır; bozuk payload `UnrecoverableError` ile retry'sız
düşer.

**ESM ve instrumentation.** App'ler ESM; `express`/`pg`/`ioredis` ESM'den import edildiğinde
require-in-the-middle tek başına yetmez. `@repo/telemetry`, import-in-the-middle'ın senkron
`module.registerHooks()` loader'ını yalnızca instrument edilen modüller için kaydeder (worker thread /
IPC yok). Bu yüzden telemetry `--import ./src/instrumentation.ts` ile app'ten önce yüklenir.

**Storage için presigned URL.** Mobil uygulama görseli doğrudan MinIO/S3'e yükler ve indirir: büyük
dosyalar API sunucusundan geçmez (bant genişliği, bellek, timeout), yetki ise kısa ömürlü imzalı URL
ile verilir. Upload URL'inde `Content-Type` imzaya dahildir (başka tip yüklenemez). `S3_PUBLIC_ENDPOINT`
servislerin gördüğü host (`minio:9000`) ile client'ın gördüğü host farklıysa doğru URL'i üretir.
MinIO için `forcePathStyle: true`; SDK'nın varsayılan CRC32 checksum'ları `WHEN_REQUIRED`'a çekildi,
yoksa presigned PUT'lar boş gövdenin checksum'ını imzalıyor.

**Graceful shutdown.** `instrumentation.ts` SIGTERM/SIGINT'te telemetry'yi flush eder. App kendi
handler'ını eklerse (HTTP/worker drain) sıralama app'e geçer: drain → bağlantıları kapat →
**en son** `shutdownTelemetry()`; instrumentation yalnızca bir fallback zamanlayıcı kurar.

## Notlar

- **TypeScript 6.0**: TS 7 (native) yayında ama typescript-eslint 8.x `typescript <6.1` istiyor ve
  TS 7'nin JS API'si henüz `unstable`. Lint zinciri desteklediğinde yükseltilebilir.
- **MinIO image'ı**: `minio/minio` Docker Hub'dan kaldırıldı; console'u koruyan topluluk fork'u
  `pgsty/minio` (sürüm pinli) kullanılıyor.
- **pnpm build script'leri**: pnpm 11 bağımlılık script'lerini varsayılan olarak engeller;
  `pnpm-workspace.yaml` → `allowBuilds` hangilerine izin verildiğini gerekçesiyle listeler.
- Sürümler `pnpm-workspace.yaml` → `catalog` üzerinden tek yerden yönetilir.
