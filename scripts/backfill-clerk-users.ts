// Node does not read .env automatically, and this script runs outside the Nest
// bootstrap that would otherwise load it. Same reasoning as prisma.config.ts.
import 'dotenv/config';
import { createClerkClient } from '@clerk/backend';
import { SyncClerkUserUseCase } from '@tripos/api/users/application';
import { PrismaUserRepository } from '@tripos/api/users/infrastructure';
import { loadServerEnv } from '@tripos/shared/config';
import { createPrismaClient } from '@tripos/shared/database';

/**
 * Reconciles the local `users` table against Clerk.
 *
 * Webhooks are forward-looking and can fail: a delivery attempted while the API
 * was down is simply lost, and a missed `user.deleted` is a privacy incident
 * rather than a cosmetic bug. ADR-0003 therefore requires a reconciliation path
 * that does not depend on delivery at all — this is it.
 *
 * It deliberately reuses `SyncClerkUserUseCase`, the exact code path the webhook
 * uses. Two implementations of "apply a Clerk user to our database" would drift,
 * and the one that runs rarely is the one that would rot unnoticed.
 *
 * Idempotent: safe to run repeatedly. Run it after any period of failed
 * deliveries, and as a scheduled job once the worker has a scheduler.
 */
async function main(): Promise<void> {
  const env = loadServerEnv();

  if (!env.CLERK_SECRET_KEY) {
    throw new Error('CLERK_SECRET_KEY is required to read users from Clerk. See .env.example.');
  }

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const prisma = createPrismaClient(env.DATABASE_URL);
  const syncUser = new SyncClerkUserUseCase(new PrismaUserRepository(prisma));

  let offset = 0;
  const limit = 100;
  let synced = 0;
  let skipped = 0;

  try {
    for (;;) {
      const page = await clerk.users.getUserList({ limit, offset });
      if (page.data.length === 0) break;

      for (const user of page.data) {
        const primary =
          user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId) ??
          user.emailAddresses[0];

        if (!primary) {
          // No email means the account cannot be invited to a trip; skip loudly
          // rather than writing a row that breaks invitations later.
          console.warn(`skip ${user.id}: no email address`);
          skipped += 1;
          continue;
        }

        const outcome = await syncUser.execute({
          type: 'user.created',
          clerkUserId: user.id,
          attributes: {
            email: primary.emailAddress,
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            avatarUrl: user.imageUrl,
          },
        });

        // Log the identifier and outcome only — never the email (CLAUDE.md §14).
        console.log(`${user.id} -> ${outcome.action}`);
        synced += 1;
      }

      if (page.data.length < limit) break;
      offset += limit;
    }

    console.log(`\nBackfill complete: ${synced} synced, ${skipped} skipped.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
