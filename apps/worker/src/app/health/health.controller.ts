import { Controller, Get } from '@nestjs/common';

/**
 * Worker liveness endpoint. See the equivalent in apps/api for why this does not
 * check dependencies.
 */
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  check(): { status: 'ok'; uptimeSeconds: number } {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}
