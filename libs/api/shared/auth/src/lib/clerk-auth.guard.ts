import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyToken } from '@clerk/backend';
import { PRISMA } from '@tripos/api/shared/database';
import type { PrismaClient } from '@tripos/shared/database';
import type { IncomingMessage } from 'node:http';
import { AUTH_CONTEXT_KEY, type AuthenticatedUser } from './authenticated-user';
import { IS_PUBLIC_KEY } from './public.decorator';

/** DI token for the Clerk secret key, supplied by the composition root. */
export const CLERK_SECRET_KEY = Symbol('CLERK_SECRET_KEY');

type AuthRequest = IncomingMessage & { [AUTH_CONTEXT_KEY]?: AuthenticatedUser };

/**
 * Verifies the caller's Clerk session token and resolves them to an internal user.
 *
 * Registered globally, so routes are authenticated by default and opening one
 * requires an explicit `@Public()` (see that decorator for why that direction
 * matters).
 *
 * This is AUTHENTICATION only — who you are. Whether you may touch a particular
 * trip is `TripAccessGuard`'s job, and the two are deliberately separate
 * (ADR-0003, ADR-0006).
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLERK_SECRET_KEY) private readonly secretKey: string | undefined,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    if (!this.secretKey) {
      // Fail closed. A misconfigured deployment must reject requests, never
      // wave them through.
      this.logger.error('CLERK_SECRET_KEY is not configured; rejecting authenticated request');
      throw new UnauthorizedException();
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let clerkUserId: string;
    try {
      const payload = await verifyToken(token, { secretKey: this.secretKey });
      clerkUserId = payload.sub;
    } catch {
      // Deliberately opaque: distinguishing "expired" from "forged" tells an
      // attacker which of their guesses was closer.
      throw new UnauthorizedException('Invalid session token');
    }

    const user = await this.prisma.user.findFirst({
      where: { clerkUserId, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      // Authenticated with Clerk but unknown here — the sync webhook has not
      // arrived yet, or the account was deleted. Either way there is no internal
      // identity to act as. `pnpm users:backfill` reconciles the first case.
      this.logger.warn(`No active local user for Clerk id ${clerkUserId}`);
      throw new UnauthorizedException('User not provisioned');
    }

    request[AUTH_CONTEXT_KEY] = { userId: user.id, clerkUserId };

    return true;
  }
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;

  const [scheme, value] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return null;
  }

  return value.trim() || null;
}
