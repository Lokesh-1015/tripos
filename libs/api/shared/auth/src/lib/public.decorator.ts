import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'triposIsPublic';

/**
 * Marks a route as reachable without authentication.
 *
 * `ClerkAuthGuard` is registered GLOBALLY, so every endpoint is protected by
 * default and forgetting to add a guard cannot expose data. Opening a route is
 * therefore an explicit, greppable decision — which is the way round it should
 * be. Reserve this for health probes, webhooks (which carry their own signature
 * verification), and genuinely public content.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
