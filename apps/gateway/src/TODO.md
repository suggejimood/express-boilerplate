# gateway — senin yazacakların

Port **8080**. Mobil uygulamanın tek giriş noktası: kimlik doğrulama, rate limit, `api`'ye proxy.
`instrumentation.ts` hazır (`--import` ile yükleniyor); app kodundan import ETME.

## Dosyalar

| Dosya                             | Sorumluluk                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/env.ts`                      | `createEnv(z.object({ ...baseEnv, ...port(8080), ...redisUrl, API_URL, JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE, RATE_LIMIT_* }))` — kök `.env.example` ile birebir (`PORT` orada yok; varsayılan 8080).               |
| `src/app.ts`                      | `createApp(deps)` → Express 5 app (listen YOK; supertest için). Sıra: request-id → access log → `GET /health`, `GET /ready` → auth → rate limit → proxy → 404/error handler.                                       |
| `src/server.ts`                   | env + logger + redis oluştur, `createApp` → `listen(PORT)`. SIGTERM/SIGINT: `server.close()` → `redis.quit()` → **en son** `shutdownTelemetry()` → `process.exit(0)`.                                              |
| `src/middleware/auth.ts`          | `jose.jwtVerify(token, secret, { issuer, audience })`. Doğrulanan `sub`'ı upstream'e `x-user-id` header'ı olarak geçir; client'tan gelen `x-user-id`'yi **sil** (spoofing). Public route'lar için allow-list.      |
| `src/middleware/rate-limit.ts`    | `new RateLimiterRedis({ storeClient: redis, points, duration, keyPrefix: 'rl' })`; anahtar: `userId ?? ip`. 429 + `Retry-After`. Redis düşerse isteği kesme: `insuranceLimiter: new RateLimiterMemory(...)`.       |
| `src/proxy.ts`                    | `createProxyMiddleware({ target: API_URL, pathFilter: '/v1', changeOrigin: true, on: { error } })` (http-proxy-middleware v4). Trace header'ları (`traceparent`) http instrumentation tarafından otomatik taşınır. |
| `src/middleware/error-handler.ts` | Express 5'te async hatalar otomatik `next(err)`'e düşer; tek tip JSON hata gövdesi.                                                                                                                                |
| `src/**/*.test.ts`                | supertest ile `createApp` (auth reddi, rate limit 429, proxy'nin header'ları temizlemesi).                                                                                                                         |

## Kullanacağın paketler

- `@repo/config` — `createEnv`, `baseEnv`, `port`, `redisUrl`, `z`
- `@repo/logger` — `createLogger({ service: 'gateway' })` (trace_id/span_id otomatik)
- `@repo/telemetry` — sadece `shutdownTelemetry()` (server.ts kapanışında)
- npm: `express`, `http-proxy-middleware`, `rate-limiter-flexible`, `ioredis`, `jose`

## Notlar

- Rate limiter için ayrı bir ioredis bağlantısı kullan, `enableOfflineQueue: false` ile: Redis yokken istekler kuyrukta beklemesin, insurance limiter devreye girsin.
- Docker `HEALTHCHECK` `GET /health`'i çağırıyor; bağımlılık kontrolü yapmayan hızlı bir liveness olmalı.
