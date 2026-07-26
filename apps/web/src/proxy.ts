import { clerkMiddleware } from '@clerk/nextjs/server';

/**
 * Clerk proxy (Next.js 16 replaces `middleware.ts` with `proxy.ts`).
 *
 * Lives in `apps/web/src/` because that is where Next looks when the app uses a
 * `src` directory. `clerk init` scaffolded this at the repo root, which Next
 * would never load in an Nx monorepo — moved here deliberately (CLAUDE.md §3).
 *
 * Authentication only. Authorization — trip membership and roles — is ours and
 * lives behind the API's TripAccessGuard (ADR-0003, ADR-0006). Do not start
 * making access decisions here.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    // Clerk's auto-proxy path. Must be present, and must come after the
    // api/trpc matcher.
    '/__clerk/:path*',
  ],
};
