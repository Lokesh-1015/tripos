export { AUTH_CONTEXT_KEY, CurrentUser } from './lib/authenticated-user';
export type { AuthenticatedUser } from './lib/authenticated-user';

export { IS_PUBLIC_KEY, Public } from './lib/public.decorator';

export { ClerkAuthGuard, CLERK_SECRET_KEY, extractBearerToken } from './lib/clerk-auth.guard';
export { AuthModule } from './lib/auth.module';
