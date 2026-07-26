export { createPrismaClient, PrismaClient } from './lib/prisma-client';

// Model types are re-exported so consumers never import @prisma/client or the
// generated directory directly — this library is the sole owner (CLAUDE.md §8).
export type { User, Prisma } from './generated/prisma';
