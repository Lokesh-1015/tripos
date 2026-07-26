import { beforeEach, describe, expect, it } from 'vitest';
import { SyncClerkUserUseCase } from './sync-clerk-user.use-case';
import type { SyncedUser, UserRepository } from './user-repository.port';

/**
 * A fake rather than a mock: it records real behaviour (including idempotency),
 * so these tests assert the use case's contract instead of asserting that
 * particular methods were called.
 */
class FakeUserRepository implements UserRepository {
  readonly rows = new Map<string, SyncedUser & { deleted: boolean }>();
  upsertCalls = 0;

  async upsertByClerkUserId(
    clerkUserId: string,
    profile: { email: string; displayName: string },
  ): Promise<SyncedUser> {
    this.upsertCalls += 1;
    const existing = this.rows.get(clerkUserId);
    const row = {
      id: existing?.id ?? `usr_${this.rows.size + 1}`,
      clerkUserId,
      email: profile.email,
      displayName: profile.displayName,
      deleted: false,
    };
    this.rows.set(clerkUserId, row);
    return row;
  }

  async softDeleteByClerkUserId(clerkUserId: string): Promise<SyncedUser | null> {
    const existing = this.rows.get(clerkUserId);
    if (!existing) return null;
    const row = { ...existing, deleted: true };
    this.rows.set(clerkUserId, row);
    return row;
  }
}

const attributes = {
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  username: null,
  avatarUrl: null,
};

describe('SyncClerkUserUseCase', () => {
  let repo: FakeUserRepository;
  let useCase: SyncClerkUserUseCase;

  beforeEach(() => {
    repo = new FakeUserRepository();
    useCase = new SyncClerkUserUseCase(repo);
  });

  it('creates a user on user.created', async () => {
    const result = await useCase.execute({
      type: 'user.created',
      clerkUserId: 'user_1',
      attributes,
    });

    expect(result).toMatchObject({ action: 'upserted' });
    expect(repo.rows.get('user_1')?.displayName).toBe('Ada Lovelace');
  });

  it('is idempotent — a replayed delivery does not create a second user', async () => {
    const event = { type: 'user.created', clerkUserId: 'user_1', attributes } as const;

    const first = await useCase.execute(event);
    const second = await useCase.execute(event);

    expect(repo.rows.size).toBe(1);
    expect(repo.upsertCalls).toBe(2);
    if (first.action !== 'upserted' || second.action !== 'upserted')
      throw new Error('expected upserts');
    expect(second.user.id).toBe(first.user.id);
  });

  it('updates an existing user on user.updated', async () => {
    await useCase.execute({ type: 'user.created', clerkUserId: 'user_1', attributes });
    await useCase.execute({
      type: 'user.updated',
      clerkUserId: 'user_1',
      attributes: { ...attributes, firstName: 'Augusta' },
    });

    expect(repo.rows.get('user_1')?.displayName).toBe('Augusta Lovelace');
  });

  it('soft-deletes rather than removing, preserving ledger integrity', async () => {
    await useCase.execute({ type: 'user.created', clerkUserId: 'user_1', attributes });

    const result = await useCase.execute({ type: 'user.deleted', clerkUserId: 'user_1' });

    expect(result.action).toBe('soft-deleted');
    expect(repo.rows.get('user_1')?.deleted).toBe(true);
    // The row must still exist — expenses reference it.
    expect(repo.rows.size).toBe(1);
  });

  it('ignores a delete for an unknown user instead of throwing', async () => {
    const result = await useCase.execute({ type: 'user.deleted', clerkUserId: 'ghost' });

    expect(result).toMatchObject({ action: 'ignored' });
  });

  it('ignores an event with no attributes rather than writing a broken row', async () => {
    const result = await useCase.execute({ type: 'user.created', clerkUserId: 'user_2' });

    expect(result).toMatchObject({ action: 'ignored' });
    expect(repo.rows.size).toBe(0);
  });
});
