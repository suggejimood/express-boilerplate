# notification — senin yazacakların

Port **3003** (sadece health HTTP). `notification` kuyruğunu tüketir ve kullanıcıya bildirim gönderir
(push / e-posta / websocket — senaryoya göre). `instrumentation.ts` hazır.

## Dosyalar

| Dosya                          | Sorumluluk                                                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/env.ts`                   | `createEnv(z.object({ ...baseEnv, ...port(3003), ...redisUrl, NOTIFICATION_CONCURRENCY }))` + sağlayıcı anahtarları.                                                                                                         |
| `src/handlers/notification.ts` | `JobHandler<'notification'>`: `type`'a göre (`generation.completed` / `generation.failed`) şablon seç, kanal üzerinden gönder. Kalıcı hatalarda (geçersiz device token) `UnrecoverableError` fırlat ki boşuna retry olmasın. |
| `src/channels/*.ts`            | Kanal arayüzü (`send(userId, message)`) + local için log'a yazan sahte kanal.                                                                                                                                                |
| `src/health.ts`                | Minimal Express: `GET /health`, `GET /ready` (redis + `worker.isRunning()`).                                                                                                                                                 |
| `src/server.ts`                | `createWorker('notification', handler, { connection, concurrency })` + health server. Kapanış: `worker.close()` → `server.close()` → `redis.quit()` → `shutdownTelemetry()`.                                                 |
| `src/**/*.test.ts`             | Handler'ı fake kanal ile test et.                                                                                                                                                                                            |

## Kullanacağın paketler

- `@repo/queue` — `createRedisConnection`, `createWorker('notification', ...)`, `NotificationJob`, `NotificationType`
- `@repo/config`, `@repo/logger`, `@repo/telemetry` (`shutdownTelemetry`)
- npm: `bullmq`, `express` (sadece health)
