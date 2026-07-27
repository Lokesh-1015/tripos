import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * The authenticated caller, as the rest of the API sees them.
 *
 * `userId` is the INTERNAL User.id — never Clerk's identifier. Every domain table
 * references this value, which is what makes changing identity provider a
 * re-mapping of one column rather than a schema migration (ADR-0003).
 */
export interface AuthenticatedUser {
  readonly userId: string;
  readonly clerkUserId: string;
}

/** Key under which the guard attaches the caller to the request. */
export const AUTH_CONTEXT_KEY = 'triposAuth';

interface RequestWithAuth {
  [AUTH_CONTEXT_KEY]?: AuthenticatedUser;
}

/**
 * Injects the authenticated caller into a handler parameter.
 *
 * Throws rather than returning undefined if the guard has not run: a handler
 * that silently receives `undefined` for the current user is how endpoints end
 * up operating on nobody, or on everybody.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithAuth>();
    const user = request[AUTH_CONTEXT_KEY];

    if (!user) {
      throw new Error(
        'CurrentUser used on a route without ClerkAuthGuard. Apply the guard or remove the decorator.',
      );
    }

    return user;
  },
);
