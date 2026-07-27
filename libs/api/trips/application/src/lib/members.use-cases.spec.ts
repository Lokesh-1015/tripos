import type { TripActor, TripRole } from '@tripos/api/shared/authz';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChangeMemberRoleUseCase,
  LeaveTripUseCase,
  MemberActionDeniedError,
  MemberNotFoundError,
  RemoveMemberUseCase,
  TransferOwnershipUseCase,
} from './members.use-cases';
import type { TripMemberRepository, TripMemberView } from './trip-member-repository.port';

class FakeMemberRepository implements TripMemberRepository {
  readonly roles = new Map<string, TripRole>();
  readonly removed = new Set<string>();
  transfers: Array<{ from: string; to: string }> = [];

  constructor(seed: Record<string, TripRole> = {}) {
    for (const [userId, role] of Object.entries(seed)) this.roles.set(userId, role);
  }

  async listActive(): Promise<TripMemberView[]> {
    return [];
  }

  async findActor(tripId: string, userId: string): Promise<TripActor | null> {
    const role = this.roles.get(userId);
    if (!role) return null;

    return {
      userId,
      tripId,
      role,
      status: this.removed.has(userId) ? 'REMOVED' : 'ACTIVE',
    };
  }

  async updateRole(_tripId: string, userId: string, role: TripRole): Promise<void> {
    this.roles.set(userId, role);
  }

  async markRemoved(_tripId: string, userId: string): Promise<void> {
    this.removed.add(userId);
  }

  async transferOwnership(_tripId: string, fromUserId: string, toUserId: string): Promise<void> {
    this.transfers.push({ from: fromUserId, to: toUserId });
    this.roles.set(fromUserId, 'ADMIN');
    this.roles.set(toUserId, 'OWNER');
  }
}

const actor = (userId: string, role: TripRole): TripActor => ({
  userId,
  tripId: 'trip_1',
  role,
  status: 'ACTIVE',
});

describe('RemoveMemberUseCase', () => {
  let repo: FakeMemberRepository;
  let useCase: RemoveMemberUseCase;

  beforeEach(() => {
    repo = new FakeMemberRepository({ owner: 'OWNER', admin: 'ADMIN', member: 'MEMBER' });
    useCase = new RemoveMemberUseCase(repo);
  });

  it('lets an admin remove a member', async () => {
    await useCase.execute(actor('admin', 'ADMIN'), 'member');

    expect(repo.removed.has('member')).toBe(true);
  });

  it('marks removed rather than deleting, preserving ledger integrity', async () => {
    await useCase.execute(actor('admin', 'ADMIN'), 'member');

    // The row still exists — expenses reference it.
    expect(await repo.findActor('trip_1', 'member')).toMatchObject({ status: 'REMOVED' });
  });

  it('refuses to remove the owner', async () => {
    await expect(useCase.execute(actor('admin', 'ADMIN'), 'owner')).rejects.toThrow(
      MemberActionDeniedError,
    );
    expect(repo.removed.has('owner')).toBe(false);
  });

  it('refuses when the target is not a member', async () => {
    await expect(useCase.execute(actor('admin', 'ADMIN'), 'stranger')).rejects.toThrow(
      MemberNotFoundError,
    );
  });

  it('denies a plain member', async () => {
    await expect(useCase.execute(actor('member', 'MEMBER'), 'admin')).rejects.toThrow(
      MemberActionDeniedError,
    );
  });
});

describe('ChangeMemberRoleUseCase', () => {
  let repo: FakeMemberRepository;
  let useCase: ChangeMemberRoleUseCase;

  beforeEach(() => {
    repo = new FakeMemberRepository({ owner: 'OWNER', admin: 'ADMIN', member: 'MEMBER' });
    useCase = new ChangeMemberRoleUseCase(repo);
  });

  it('lets the owner promote a member to admin', async () => {
    await useCase.execute(actor('owner', 'OWNER'), 'member', 'ADMIN');

    expect(repo.roles.get('member')).toBe('ADMIN');
  });

  it('blocks an admin from creating another admin — no granting your own level', async () => {
    await expect(useCase.execute(actor('admin', 'ADMIN'), 'member', 'ADMIN')).rejects.toThrow(
      MemberActionDeniedError,
    );
    expect(repo.roles.get('member')).toBe('MEMBER');
  });

  it('never assigns OWNER as a role', async () => {
    await expect(useCase.execute(actor('owner', 'OWNER'), 'member', 'OWNER')).rejects.toThrow(
      /transferred explicitly/i,
    );
  });
});

describe('LeaveTripUseCase', () => {
  it('lets a member leave', async () => {
    const repo = new FakeMemberRepository({ member: 'MEMBER' });

    await new LeaveTripUseCase(repo).execute(actor('member', 'MEMBER'));

    expect(repo.removed.has('member')).toBe(true);
  });

  it('blocks the owner from orphaning the trip', async () => {
    const repo = new FakeMemberRepository({ owner: 'OWNER' });

    await expect(new LeaveTripUseCase(repo).execute(actor('owner', 'OWNER'))).rejects.toThrow(
      /transfer ownership/i,
    );
    expect(repo.removed.has('owner')).toBe(false);
  });
});

describe('TransferOwnershipUseCase', () => {
  let repo: FakeMemberRepository;
  let useCase: TransferOwnershipUseCase;

  beforeEach(() => {
    repo = new FakeMemberRepository({ owner: 'OWNER', admin: 'ADMIN', member: 'MEMBER' });
    useCase = new TransferOwnershipUseCase(repo);
  });

  it('moves ownership and demotes the previous owner', async () => {
    await useCase.execute(actor('owner', 'OWNER'), 'member');

    expect(repo.roles.get('member')).toBe('OWNER');
    expect(repo.roles.get('owner')).toBe('ADMIN');
    expect(repo.transfers).toEqual([{ from: 'owner', to: 'member' }]);
  });

  it('is owner-only', async () => {
    await expect(useCase.execute(actor('admin', 'ADMIN'), 'member')).rejects.toThrow(
      MemberActionDeniedError,
    );
    expect(repo.transfers).toHaveLength(0);
  });

  it('refuses transfer to a removed member', async () => {
    await repo.markRemoved('trip_1', 'member');

    await expect(useCase.execute(actor('owner', 'OWNER'), 'member')).rejects.toThrow(
      MemberActionDeniedError,
    );
  });
});
