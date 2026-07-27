import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { Button } from '@tripos/shared/ui';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './global.css';

export const metadata: Metadata = {
  title: 'TripOS — plan the trip, not the spreadsheet',
  description: 'A collaborative workspace for group travel — plan, decide, split, and remember.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // TripOS is used primarily on phones, often on poor connections (CLAUDE.md §13).
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-page text-text min-h-dvh antialiased">
        <ClerkProvider>
          <header className="border-border bg-surface/80 sticky top-0 z-10 border-b backdrop-blur">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span aria-hidden>🧭</span>
                TripOS
              </Link>

              <nav className="flex items-center gap-2">
                <Show when="signed-out">
                  <SignInButton>
                    <Button variant="ghost" size="sm">
                      Sign in
                    </Button>
                  </SignInButton>
                  <SignUpButton>
                    <Button size="sm">Get started</Button>
                  </SignUpButton>
                </Show>
                <Show when="signed-in">
                  <Link
                    href="/trips"
                    className="text-text-muted hover:text-text px-2 py-1 text-sm font-medium"
                  >
                    Trips
                  </Link>
                  <UserButton />
                </Show>
              </nav>
            </div>
          </header>

          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
