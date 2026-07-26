import { oc } from '@orpc/contract';
import { z } from 'zod';

/**
 * System contract.
 *
 * The first contract in the codebase, and the reference for every one that
 * follows. The shape is defined exactly ONCE here as a Zod schema; the API
 * implementation, the frontend client, and the emitted OpenAPI document are all
 * derived from it, so they cannot drift (ADR-0004, ADR-0009).
 *
 * Note this is distinct from the plain `/api/health` liveness endpoint: that one
 * must stay dependency-free and trivially fast for platform probes. This one is
 * for humans and tooling asking "what exactly is deployed here?".
 */
export const systemStatusOutputSchema = z.object({
  status: z.literal('ok'),
  environment: z.enum(['development', 'test', 'production']),
  uptimeSeconds: z.number().int().nonnegative(),
  serverTime: z.iso.datetime(),
});

export type SystemStatus = z.infer<typeof systemStatusOutputSchema>;

export const systemContract = {
  status: oc
    .route({
      method: 'GET',
      path: '/system/status',
      summary: 'Report the running API build and environment',
      tags: ['system'],
    })
    .output(systemStatusOutputSchema),
};
