import { Module } from '@nestjs/common';
import { PRISMA, PrismaModule } from '@tripos/api/shared/database';
import type { PrismaClient } from '@tripos/shared/database';
import { SyncClerkUserUseCase, USER_REPOSITORY } from '@tripos/api/users/application';
import type { UserRepository } from '@tripos/api/users/application';
import { PrismaUserRepository } from '@tripos/api/users/infrastructure';
import { loadServerEnv } from '@tripos/shared/config';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { CLERK_WEBHOOK_SIGNING_SECRET } from './users.tokens';

/**
 * The users module — the identity boundary from ADR-0003 in code.
 *
 * This is where the layers are bound together: the Prisma repository is supplied
 * as the `UserRepository` port, and the use case receives the interface rather
 * than the implementation. That binding is the only place in the module that
 * knows both sides exist, which is what keeps the rest extractable (ADR-0001).
 */
@Module({
  imports: [PrismaModule],
  controllers: [ClerkWebhookController],
  providers: [
    {
      // A factory rather than `useClass`, because the adapter carries no Nest
      // decorators — see the note in PrismaUserRepository. Binding it here is
      // exactly the composition root's job.
      provide: USER_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaUserRepository(prisma),
      inject: [PRISMA],
    },
    {
      provide: SyncClerkUserUseCase,
      useFactory: (users: UserRepository) => new SyncClerkUserUseCase(users),
      inject: [USER_REPOSITORY],
    },
    {
      // Optional on purpose: the API must still boot without it so local work
      // that does not involve webhooks is unblocked. The controller returns 503
      // rather than accepting unverified payloads when it is missing.
      provide: CLERK_WEBHOOK_SIGNING_SECRET,
      useFactory: (): string | undefined => loadServerEnv().CLERK_WEBHOOK_SIGNING_SECRET,
    },
  ],
})
export class UsersModule {}
