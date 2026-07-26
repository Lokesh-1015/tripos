import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ReadinessService, type ReadinessReport } from './readiness.service';

/**
 * Liveness and readiness probes.
 *
 * These are plain Nest routes rather than oRPC contract procedures on purpose:
 * platform probes must keep working even if the contract layer is misconfigured,
 * and they are infrastructure rather than product API surface.
 */
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly readiness: ReadinessService) {}

  /**
   * Liveness. Answers only "is this process up and serving HTTP". It must NOT
   * check dependencies — a liveness probe that fails when Postgres blips causes
   * the platform to restart a healthy container, turning a short dependency
   * outage into a restart loop.
   */
  @Get('health')
  health(): { status: 'ok'; uptimeSeconds: number } {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  /**
   * Readiness. Answers "should this instance receive traffic", returning 503 when
   * a required dependency is unreachable so load balancers route away.
   *
   * The 503 is raised as an exception carrying the report as its body, rather
   * than by injecting the framework's response object. That keeps this controller
   * free of any Express-specific types — which matters because the HTTP adapter is
   * an implementation detail we may change (ADR-0007 notes Fastify as an option).
   */
  @Get('ready')
  async ready(): Promise<ReadinessReport> {
    const report = await this.readiness.check();

    if (report.status !== 'ready') {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}
