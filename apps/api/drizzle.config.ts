import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read .env itself; use the shared one at the repo root.
try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env file: rely on the real environment.
}

export default defineConfig({
  dialect: 'postgresql',
  // Written by hand (see src/TODO.md). Migrations are owned by the api service only.
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/app_db',
  },
  strict: true,
  verbose: true,
});
