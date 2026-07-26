'use client';

/**
 * Global error boundary.
 *
 * Catches errors thrown in the root layout — the one place a normal `error.tsx`
 * cannot reach. Because it replaces the root layout when it renders, it must
 * supply its own `<html>` and `<body>`.
 *
 * Every production Next app needs this: without it, a root-layout failure shows
 * the framework's unstyled fallback. Sentry wiring goes here in M0's observability
 * step so root-layout crashes are actually reported.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something went wrong</h1>
          <p>We hit an unexpected error. Your trip data is safe.</p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
