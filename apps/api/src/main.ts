import { NestFactory } from '@nestjs/core';
import type { ServerEnv } from '@tripos/shared/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';
import { SERVER_ENV } from './app/config/server-env';

/**
 * API bootstrap.
 *
 * Per CLAUDE.md §3 this app stays thin: global wiring and listen. All behaviour
 * lives in libs/api/<domain>/*.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Buffer startup logs until the logger is configured, so nothing is lost.
    bufferLogs: true,

    // Required for webhook signature verification: the signature covers the exact
    // bytes Clerk sent, so the handler must see the raw body rather than a
    // re-serialised parse of it.
    rawBody: true,
  });

  // Replace Nest's default logger with pino, and flush the buffered startup logs
  // through it so nothing is lost and everything is structured.
  app.useLogger(app.get(Logger));

  // Parsed and validated during module init by serverEnvProvider — a bad
  // environment has already failed the boot by this point.
  const env = app.get<ServerEnv>(SERVER_ENV);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  // Lets Nest run onModuleDestroy/onApplicationShutdown hooks on SIGTERM, which
  // is how Railway/Render stop containers. Without this, in-flight requests and
  // open database connections are dropped rather than drained.
  app.enableShutdownHooks();

  await app.listen(env.PORT);

  app.get(Logger).log(`TripOS API listening on http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
}

void bootstrap();
