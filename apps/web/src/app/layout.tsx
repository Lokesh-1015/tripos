import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './global.css';

export const metadata: Metadata = {
  title: 'TripOS',
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
      <body>
        <ClerkProvider>
          <header className="border-border flex items-center justify-between gap-4 border-b px-4 py-3">
            <span className="text-brand-600 text-lg font-semibold">TripOS</span>
            <nav className="flex items-center gap-2">
              <Show when="signed-out">
                <SignInButton />
                <SignUpButton />
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </nav>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
