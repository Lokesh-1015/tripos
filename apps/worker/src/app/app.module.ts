import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

/**
 * Worker root module.
 *
 * A registry only. Queue processors arrive as Nest modules from
 * libs/api/<domain>/* as background work is introduced (CLAUDE.md §3).
 */
@Module({
  imports: [],
  controllers: [HealthController],
})
export class AppModule {}
