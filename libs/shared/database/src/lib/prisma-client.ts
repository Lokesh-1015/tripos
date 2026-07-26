import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

/**
 * Constructs a Prisma client.
 *
 * Prisma 7 connects through a driver adapter rather than a bundled query engine
 * (ADR-0011), so the connection string is supplied here at construction time
 * rather than read from the schema.
 *
 * This function is deliberately framework-free — no Nest, no decorators. That is
 * what keeps `libs/shared/database` importable from any scope without dragging a
 * server framework into the graph. The Nest module that manages this client's
 * lifecycle lives on the API side, alongside the first repository that needs it.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}

export { PrismaClient };
