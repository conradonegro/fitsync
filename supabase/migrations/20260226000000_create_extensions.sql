-- Enable required Postgres extensions.
-- All extensions are placed in the extensions schema to keep public clean.
--
-- uuid-ossp  : uuid_generate_v4() — available for legacy usage; gen_random_uuid() is preferred.
-- pgcrypto   : crypt() / gen_salt() — used in seed.sql to hash test user passwords.
-- pg_cron    : scheduled jobs — required for the GDPR anonymization job (ADR-019, Phase 2 impl).
--              Note: on Supabase Cloud, pg_cron must also be enabled via the Extensions
--              page in the dashboard in addition to this migration.

create extension if not exists "uuid-ossp"  with schema extensions;
create extension if not exists "pgcrypto"   with schema extensions;
create extension if not exists "pg_cron"    with schema extensions;
