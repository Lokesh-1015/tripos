import { hashInviteToken } from '@tripos/api/trips/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { AcceptInviteUseCase, InviteNotAcceptableError } from './accept-invite.use-case';
import { CreateInviteUseCase, InvalidInviteError } from './create-invite.use-case';
import { CreateTripUseCase, InvalidTripDatesError } from './create-trip.use-case';
import type {
  CreateInviteInput,
  RedeemOutcome,
  StoredInvite,
  TripInviteRepository,
} from './trip-invite-repository.port';
import type { CreateTripInput, TripRepository, TripSummary } from './trip-repository.port';

const NOW = new Date('2026-07-27T00:00:00.000Z');
const hour = 60 * 60 * 1000;

class FakeTripRepository implements TripRepository {
  readonly created: CreateTripInput[] = [];

  async createWithOwner(input: CreateTripInput): Promise<TripSummary> {
    this.created.push(input);
    return {
      id: 'trip_1',
      name: input.name,
      destination: input.destination,
      timezone: input.timezone,
      baseCurrency: input.baseCurrency,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'PLANNING',
      memberCount: 1,
      myRole: 'OWNER',
      myUserId: input.createdById,
    };
  }

  async listForUser(): Promise<TripSummary[]> {
    return [];
  }

  async findByIdForUser(): Promise<TripSummary | null> {
    return null;
  }
}

class FakeInviteRepository implements TripInviteRepository {
  readonly stored = new Map<string, StoredInvite>();
  redeemCalls = 0;
  private seq = 0;

  async create(input: CreateInviteInput): Promise<{ id: string; expiresAt: Date }> {
    this.seq += 1;
    const id = `inv_${this.seq}`;
    this.stored.set(input.tokenHash, {
      id,
      tripId: input.tripId,
      role: input.role,
      expiresAt: input.expiresAt,
      revokedAt: null,
      maxUses: input.maxUses,
      useCount: 0,
    });
    return { id, expiresAt: input.expiresAt };
  }

  async findByTokenHash(tokenHash: string): Promise<StoredInvite | null> {
    return this.stored.get(tokenHash) ?? null;
  }

  async redeem(_inviteId: string): Promise<RedeemOutcome> {
    this.redeemCalls += 1;
    return { status: 'joined', tripId: 'trip_1', role: 'MEMBER' };
  }

  async revoke(): Promise<void> {
    /* not exercised here */
  }

  /** Test helper: mutate a stored invite as the database would. */
  patch(tokenHash: string, changes: Partial<StoredInvite>): void {
    const existing = this.stored.get(tokenHash);
    if (existing) this.stored.set(tokenHash, { ...existing, ...changes });
  }
}

describe('CreateTripUseCase', () => {
  let trips: FakeTripRepository;
  let useCase: CreateTripUseCase;

  const command = {
    name: 'Goa 2026',
    timezone: 'Asia/Kolkata',
    baseCurrency: 'inr',
    actorUserId: 'user_1',
  };

  beforeEach(() => {
    trips = new FakeTripRepository();
    useCase = new CreateTripUseCase(trips);
  });

  it('makes the creator the OWNER', async () => {
    const trip = await useCase.execute(command);

    expect(trip.myRole).toBe('OWNER');
    expect(trips.created[0]?.createdById).toBe('user_1');
  });

  it('normalises the currency code', async () => {
    await useCase.execute(command);

    expect(trips.created[0]?.baseCurrency).toBe('INR');
  });

  it('trims the name and rejects a blank one', async () => {
    await useCase.execute({ ...command, name: '  Goa 2026  ' });
    expect(trips.created[0]?.name).toBe('Goa 2026');

    await expect(useCase.execute({ ...command, name: '   ' })).rejects.toThrow(
      InvalidTripDatesError,
    );
  });

  it('rejects an end date before the start date', async () => {
    await expect(
      useCase.execute({
        ...command,
        startDate: new Date('2026-08-10'),
        endDate: new Date('2026-08-01'),
      }),
    ).rejects.toThrow(/cannot end before it starts/);
  });

  it('accepts a single-day trip', async () => {
    const day = new Date('2026-08-10');

    await expect(
      useCase.execute({ ...command, startDate: day, endDate: day }),
    ).resolves.toBeDefined();
  });
});

describe('CreateInviteUseCase', () => {
  let invites: FakeInviteRepository;
  let useCase: CreateInviteUseCase;

  beforeEach(() => {
    invites = new FakeInviteRepository();
    useCase = new CreateInviteUseCase(invites, () => NOW);
  });

  const command = { tripId: 'trip_1', actorUserId: 'user_1' };

  it('returns the raw token but stores only its hash', async () => {
    const invite = await useCase.execute(command);

    expect(invite.token).toBeTruthy();
    // The raw token must appear nowhere in what was persisted.
    expect(invites.stored.has(invite.token)).toBe(false);
    expect(invites.stored.has(hashInviteToken(invite.token))).toBe(true);
  });

  it('refuses to grant ownership through a link', async () => {
    await expect(useCase.execute({ ...command, role: 'OWNER' })).rejects.toThrow(
      /cannot grant ownership/i,
    );
  });

  it('defaults to MEMBER', async () => {
    const invite = await useCase.execute(command);

    expect(invites.stored.get(hashInviteToken(invite.token))?.role).toBe('MEMBER');
  });

  it('rejects a non-positive use limit', async () => {
    await expect(useCase.execute({ ...command, maxUses: 0 })).rejects.toThrow(InvalidInviteError);
  });

  it('rejects an expiry in the past', async () => {
    await expect(
      useCase.execute({ ...command, expiresAt: new Date(NOW.getTime() - hour) }),
    ).rejects.toThrow(/expiry must be in the future/i);
  });

  it('issues a distinct token per invite', async () => {
    const a = await useCase.execute(command);
    const b = await useCase.execute(command);

    expect(a.token).not.toBe(b.token);
  });
});

describe('AcceptInviteUseCase', () => {
  let invites: FakeInviteRepository;
  let create: CreateInviteUseCase;
  let accept: AcceptInviteUseCase;

  beforeEach(() => {
    invites = new FakeInviteRepository();
    create = new CreateInviteUseCase(invites, () => NOW);
    accept = new AcceptInviteUseCase(invites, () => NOW);
  });

  it('joins the trip with a valid token', async () => {
    const invite = await create.execute({ tripId: 'trip_1', actorUserId: 'owner' });

    const result = await accept.execute({ token: invite.token, actorUserId: 'joiner' });

    expect(result.status).toBe('joined');
  });

  it('tolerates surrounding whitespace from a pasted link', async () => {
    const invite = await create.execute({ tripId: 'trip_1', actorUserId: 'owner' });

    await expect(
      accept.execute({ token: `  ${invite.token}  `, actorUserId: 'joiner' }),
    ).resolves.toMatchObject({ status: 'joined' });
  });

  it('rejects an unknown token without revealing that it is unknown', async () => {
    const error = await accept
      .execute({ token: 'made-up', actorUserId: 'joiner' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InviteNotAcceptableError);
    // Same user-facing wording as any other invalid invite — no probing.
    expect((error as InviteNotAcceptableError).message).toMatch(/not valid/i);
  });

  it('rejects a revoked invite', async () => {
    const invite = await create.execute({ tripId: 'trip_1', actorUserId: 'owner' });
    invites.patch(hashInviteToken(invite.token), { revokedAt: NOW });

    await expect(accept.execute({ token: invite.token, actorUserId: 'j' })).rejects.toThrow(
      /revoked/i,
    );
  });

  it('rejects an expired invite', async () => {
    const invite = await create.execute({ tripId: 'trip_1', actorUserId: 'owner' });
    invites.patch(hashInviteToken(invite.token), { expiresAt: new Date(NOW.getTime() - 1) });

    await expect(accept.execute({ token: invite.token, actorUserId: 'j' })).rejects.toThrow(
      /expired/i,
    );
  });

  it('rejects an exhausted invite', async () => {
    const invite = await create.execute({ tripId: 'trip_1', actorUserId: 'owner', maxUses: 1 });
    invites.patch(hashInviteToken(invite.token), { useCount: 1 });

    await expect(accept.execute({ token: invite.token, actorUserId: 'j' })).rejects.toThrow(
      /maximum number of times/i,
    );
  });

  it('does not reach the repository when the invite is already invalid', async () => {
    const invite = await create.execute({ tripId: 'trip_1', actorUserId: 'owner' });
    invites.patch(hashInviteToken(invite.token), { revokedAt: NOW });

    await accept.execute({ token: invite.token, actorUserId: 'j' }).catch(() => undefined);

    expect(invites.redeemCalls).toBe(0);
  });
});
