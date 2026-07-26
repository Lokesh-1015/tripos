import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { PRISMA } from '@tripos/api/shared/database';
import type { ServerEnv } from '@tripos/shared/config';
import type { PrismaClient } from '@tripos/shared/database';
import Redis from 'ioredis';
import { SERVER_ENV } from '../config/server-env';

export interface DependencyCheck {
  name: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface ReadinessReport {
  status: 'ready' | 'degraded';
  checks: DependencyCheck[];
}

/**
 * Readiness checks for the dependencies the API cannot serve traffic without.
 *
 * Deliberately separate from `/health` (liveness). Liveness answers "is this
 * process alive" and must never fail because Postgres blipped — otherwise the
 * platform restarts a healthy container and turns a brief outage into a restart
 * loop. Readiness answers "should this instance receive traffic", and failing it
 * is the correct response to a dead dependency.
 */
@Injectable()
export class ReadinessService implements OnApplicationShutdown {
  private readonly logger = new Logger(ReadinessService.name);
  private readonly redis: Redis;

  constructor(
    @Inject(SERVER_ENV) env: ServerEnv,
    // The shared client from PrismaModule — one connection pool for the whole
    // process. Constructing a second one here would double the pool and exhaust
    // Postgres connections under load.
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {
    this.redis = new Redis(env.REDIS_URL, {
      // Connect on first use rather than at construction, so a Redis outage at
      // boot leaves the API running and reporting `degraded` instead of refusing
      // to start.
      lazyConnect: true,

      // The offline queue must stay ENABLED. With it disabled the very first
      // probe fails instantly with "Stream isn't writeable", because the lazy
      // connection has not been established yet — a readiness endpoint that
      // reports degraded on its first call would fail every deploy. Queuing lets
      // the ping wait for the connection instead.
      enableOfflineQueue: true,

      // Bound how long that wait can be, so a genuinely dead Redis produces a
      // timeout (correctly degraded) rather than an indefinitely hanging probe.
      connectTimeout: 2_000,
      commandTimeout: 2_000,
      maxRetriesPerRequest: 1,
    });

    // Without a listener, ioredis connection errors become unhandled events and
    // can take the process down — the opposite of what a health check is for.
    this.redis.on('error', (error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });
  }

  async check(): Promise<ReadinessReport> {
    const checks = await Promise.all([this.checkPostgres(), this.checkRedis()]);

    return {
      status: checks.every((c) => c.ok) ? 'ready' : 'degraded',
      checks,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    // Prisma's lifecycle is owned by PrismaModule; only Redis is ours to close.
    await Promise.allSettled([this.redis.quit()]);
  }

  private async checkPostgres(): Promise<DependencyCheck> {
    return this.timed('postgres', async () => {
      await this.prisma.$queryRaw`select 1`;
    });
  }

  private async checkRedis(): Promise<DependencyCheck> {
    return this.timed('redis', async () => {
      await this.redis.ping();
    });
  }

  private async timed(name: string, probe: () => Promise<void>): Promise<DependencyCheck> {
    const startedAt = Date.now();
    try {
      await probe();
      return { name, ok: true, latencyMs: Date.now() - startedAt };
    } catch (cause) {
      return {
        name,
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: cause instanceof Error ? cause.message : 'Unknown error',
      };
    }
  }
}
