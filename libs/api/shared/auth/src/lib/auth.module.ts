import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '@tripos/api/shared/database';
import { loadServerEnv } from '@tripos/shared/config';
import { ClerkAuthGuard, CLERK_SECRET_KEY } from './clerk-auth.guard';

/**
 * Registers `ClerkAuthGuard` GLOBALLY.
 *
 * Every route is authenticated unless it opts out with `@Public()`. The
 * alternative — applying the guard per controller — means a new endpoint is
 * unprotected by default, and the failure mode of forgetting is data exposure
 * rather than a visible error. Defaults should fail safe.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: CLERK_SECRET_KEY,
      useFactory: (): string | undefined => loadServerEnv().CLERK_SECRET_KEY,
    },
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
  ],
})
export class AuthModule {}
