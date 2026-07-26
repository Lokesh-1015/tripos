import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadServerEnv } from '@tripos/shared/config';
import { AppModule } from './app/app.module';

/**
 * Worker bootstrap.
 *
 * Background jobs live here rather than in `api` because they have a different
 * scaling and failure profile from request handling (ADR-0001): a slow image
 * transcode or a retrying email must never consume an HTTP worker.
 *
 * It still exposes HTTP — only so the hosting platform has a liveness endpoint to
 * probe. No business endpoints belong here; BullMQ consumers arrive from
 * libs/api/<domain>/* as queues are introduced.
 */
async function bootstrap(): Promise<void> {
  const env = loadServerEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix('internal');

  // Critical for a queue consumer: on SIGTERM, stop accepting new jobs and let
  // in-flight ones finish instead of abandoning them mid-execution.
  app.enableShutdownHooks();

  // Offset from the API port so both can run locally at once.
  const port = env.PORT + 1;
  await app.listen(port);

  new Logger('Bootstrap').log(
    `TripOS worker listening on http://localhost:${port} (${env.NODE_ENV})`,
  );
}

void bootstrap();
