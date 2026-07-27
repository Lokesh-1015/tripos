import { Controller, Inject } from '@nestjs/common';
import { Public } from '@tripos/api/shared/auth';
import { Implement, implement } from '@orpc/nest';
import type { ServerEnv } from '@tripos/shared/config';
import { contract } from '@tripos/shared/contracts';
import { SERVER_ENV } from '../config/server-env';

/**
 * Implements the `system` namespace of the API contract.
 *
 * The `@Implement` decorator binds this handler to the contract, so the route,
 * method, and response shape all come from `libs/shared/contracts` — TypeScript
 * fails the build if the handler returns anything the contract does not describe.
 * That is the whole point of ADR-0009: there is no second definition to drift.
 *
 * This controller lives in the app rather than a domain library because it
 * reports on the process itself, not on a business domain (CLAUDE.md §3).
 */
// Build/environment metadata only — no user data, and useful for debugging a
// deployment before you can authenticate against it.
@Public()
@Controller()
export class SystemController {
  private readonly startedAt = Date.now();

  constructor(@Inject(SERVER_ENV) private readonly env: ServerEnv) {}

  @Implement(contract.system.status)
  status() {
    return implement(contract.system.status).handler(() => ({
      status: 'ok' as const,
      environment: this.env.NODE_ENV,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      serverTime: new Date().toISOString(),
    }));
  }
}
