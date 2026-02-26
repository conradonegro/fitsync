-- Application-level enums.
--
-- user_role: trainer | athlete — mutually exclusive per ADR-017.
--   Stored as a Postgres ENUM so supabase gen types produces a proper
--   TypeScript string literal union, matching userRoleSchema in @fitsync/shared.
--
-- relationship_status: pending → active → revoked lifecycle for
--   coach_athlete_relationships. Values are stable; extending an ENUM
--   is a non-transactional DDL but acceptable for this low-change type.

create type public.user_role as enum ('trainer', 'athlete');

create type public.relationship_status as enum ('pending', 'active', 'revoked');
