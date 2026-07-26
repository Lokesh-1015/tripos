// Prisma 7 no longer loads .env automatically, so CLI commands would otherwise
// see an empty DATABASE_URL and fail with a confusing error. Load it explicitly.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 removed `url` from the datasource block in schema.prisma; the
 * connection string for migrate/introspect lives here instead, and the runtime
 * client connects via a driver adapter (see libs/shared/database and ADR-0011).
 *
 * This file sits at the repo root because that is where the Prisma CLI looks by
 * default — putting it elsewhere would mean passing `--config` on every command.
 * Ownership of the schema itself still belongs solely to libs/shared/database
 * (CLAUDE.md §8).
 */
export default defineConfig({
  schema: 'libs/shared/database/prisma/schema.prisma',

  migrations: {
    path: 'libs/shared/database/prisma/migrations',
    // `seed` is intentionally unset: pointing it at a file that does not exist
    // yet would make `prisma db seed` fail confusingly. Add it together with the
    // seed script, once there is data worth seeding (M1).
  },

  datasource: {
    url: env('DATABASE_URL'),
  },
});
