/**
 * @fitsync/shared
 *
 * Single source of truth for schemas, RBAC, and business logic.
 * Zero infrastructure dependencies — this package must never import
 * from @fitsync/database or any platform-specific package.
 */

export * from './schemas/index';
export * from './rbac/index';
