import { Module } from '@nestjs/common';
import { AuthModule } from '@tripos/api/shared/auth';
import { TripAccessModule } from '@tripos/api/shared/trip-access';
import { TripsModule } from '@tripos/api/trips/feature';
import { UsersModule } from '@tripos/api/users/feature';
import { ORPCModule } from '@orpc/nest';
import type { ServerEnv } from '@tripos/shared/config';
import { LoggerModule, type Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { serverEnvProvider, SERVER_ENV } from './config/server-env';
import { HealthController } from './health/health.controller';
import { ReadinessService } from './health/readiness.service';
import { SystemController } from './system/system.controller';

/**
 * Root module.
 *
 * This file is a registry, not a place for logic. Each domain arrives as its own
 * Nest module from libs/api/<domain>/feature and is imported here (CLAUDE.md §3).
 */
@Module({
  imports: [
    // Structured JSON logging with a correlation id per request, so one request
    // can be traced across log lines — and later across services, once a module
    // is extracted per ADR-0001.
    LoggerModule.forRootAsync({
      providers: [serverEnvProvider],
      inject: [SERVER_ENV],
      useFactory: (env: ServerEnv): Params => ({
        pinoHttp: {
          level: env.LOG_LEVEL,

          // Honour an inbound x-request-id so a correlation id set by a proxy or
          // the frontend survives, and echo it back for client-side correlation.
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const inbound = req.headers['x-request-id'];
            const id = typeof inbound === 'string' && inbound.length > 0 ? inbound : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },

          // NEVER log PII, tokens, or full request bodies (CLAUDE.md §14).
          // These are removed outright rather than masked.
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            remove: true,
          },

          // Probes would otherwise dominate the logs.
          autoLogging: {
            ignore: (req: IncomingMessage) => req.url === '/api/health' || req.url === '/api/ready',
          },

          // Human-readable locally; raw JSON in production, where a log
          // aggregator parses it.
          ...(env.NODE_ENV === 'development'
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
        },
      }),
    }),

    // Wires oRPC into Nest so `@Implement`-decorated handlers are served with
    // contract-derived validation (ADR-0009).
    ORPCModule.forRoot({}),

    // Authentication, registered globally: every route requires a valid Clerk
    // session unless it opts out with @Public(). Fail-safe by default.
    AuthModule,

    // Trip-scoped authorization. Global so no domain module can forget to import
    // it — with an authorization guard, a forgotten import is a security hole
    // rather than a compile error (ADR-0006).
    TripAccessModule,

    // Domain modules. Each arrives from libs/api/<domain>/feature (CLAUDE.md §3).
    UsersModule,
    TripsModule,
  ],
  controllers: [HealthController, SystemController],
  providers: [serverEnvProvider, ReadinessService],
  exports: [SERVER_ENV],
})
export class AppModule {}
