import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { loadServerEnv } from '@tripos/shared/config';
import { createPrismaClient, type PrismaClient } from '@tripos/shared/database';

/** DI token for the shared Prisma client. */
export const PRISMA = Symbol('PRISMA');

/**
 * Owns the single Prisma client for the whole API process.
 *
 * One client means one connection pool. Letting each domain construct its own
 * would multiply pools and exhaust Postgres connections long before real load —
 * a failure that only shows up under concurrency, which is the worst time to
 * discover it.
 *
 * The client itself is built by the framework-free factory in
 * `libs/shared/database` (ADR-0011); this class exists only to bind its lifecycle
 * to Nest's.
 */
@Injectable()
export class PrismaLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    // Drain on SIGTERM so in-flight queries finish and sockets close cleanly.
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      useFactory: (): PrismaClient => createPrismaClient(loadServerEnv().DATABASE_URL),
    },
    PrismaLifecycle,
  ],
  exports: [PRISMA],
})
export class PrismaModule {}
