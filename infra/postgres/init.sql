-- Runs once, on the first start with an empty data volume (docker-entrypoint-initdb.d), as
-- POSTGRES_USER inside POSTGRES_DB (both from the root .env) — so no names are hard-coded here.

-- Case-insensitive text, e.g. for unique e-mail columns.
CREATE EXTENSION IF NOT EXISTS citext;

-- Least-privilege role for running services; migrations run as the owner (POSTGRES_USER).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN PASSWORD 'app_runtime';
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_runtime', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO app_runtime;
-- Applies to objects later created by the current role (the migration owner).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
