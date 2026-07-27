import { seedUser, startTestDatabase, type TestDatabase } from '@tripos/api/shared/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaTripInviteRepository } from './prisma-trip-invite.repository';
import { PrismaTripMemberRepository } from './prisma-trip-member.repository';
import { PrismaTripRepository } from './prisma-trip.repository';

/**
 * Integration tests against a REAL Postgres (CLAUDE.md §12).
 *
 * Everything here depends on behaviour a mocked Prisma cannot reproduce:
 * transaction atomicity, unique constraints, and conditional updates deciding a
 * race. The unit suites verify orchestration; these verify the guarantees the
 * orchestration assumes.
 */
describe('trips infrastructure (integration)', () => {
  let db: TestDatabase;
  let trips: PrismaTripRepository;
  let invites: PrismaTripInviteRepository;
  let members: PrismaTripMemberRepository;

  beforeAll(async () => {
    db = await startTestDatabase();
    trips = new PrismaTripRepository(db.prisma);
    invites = new PrismaTripInviteRepository(db.prisma);
    members = new PrismaTripMemberRepository(db.prisma);
  }, 180_000);

  afterAll(async () => {
    await db?.stop();
  }, 60_000);

  beforeEach(async () => {
    await db.reset();
  });

  const newTrip = async (ownerId: string) =>
    trips.createWithOwner({
      name: 'Goa 2026',
      destination: 'Goa',
      timezone: 'Asia/Kolkata',
      baseCurrency: 'INR',
      startDate: null,
      endDate: null,
      createdById: ownerId,
    });

  describe('createWithOwner', () => {
    it('creates the trip and its owner membership together', async () => {
      const owner = await seedUser(db.prisma);

      const trip = await newTrip(owner.id);

      const membership = await db.prisma.tripMembership.findUnique({
        where: { tripId_userId: { tripId: trip.id, userId: owner.id } },
      });

      expect(membership?.role).toBe('OWNER');
      expect(trip.memberCount).toBe(1);
    });

    it('leaves NO trip behind when the membership write fails', async () => {
      // A non-existent creator violates the membership FK. If the two writes were
      // not one transaction, the trip row would survive as an orphan that no
      // query can reach — every trip query scopes by membership.
      await expect(newTrip('user_does_not_exist')).rejects.toThrow();

      expect(await db.prisma.trip.count()).toBe(0);
    });

    it('scopes listForUser to the caller', async () => {
      const owner = await seedUser(db.prisma);
      const stranger = await seedUser(db.prisma);
      await newTrip(owner.id);

      expect(await trips.listForUser(owner.id)).toHaveLength(1);
      expect(await trips.listForUser(stranger.id)).toHaveLength(0);
    });

    it('hides trips from removed members', async () => {
      const owner = await seedUser(db.prisma);
      const member = await seedUser(db.prisma);
      const trip = await newTrip(owner.id);
      await db.prisma.tripMembership.create({
        data: { tripId: trip.id, userId: member.id, role: 'MEMBER', status: 'ACTIVE' },
      });

      await members.markRemoved(trip.id, member.id);

      expect(await trips.listForUser(member.id)).toHaveLength(0);
      // The row survives — expenses reference it (ADR-0005).
      expect(
        await db.prisma.tripMembership.count({ where: { tripId: trip.id, userId: member.id } }),
      ).toBe(1);
    });
  });

  describe('invite redemption', () => {
    const issueInvite = async (tripId: string, ownerId: string, maxUses: number | null) =>
      invites.create({
        tripId,
        tokenHash: `hash_${Math.random().toString(36).slice(2)}`,
        role: 'MEMBER',
        email: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        maxUses,
        createdById: ownerId,
      });

    it('joins the trip and consumes a use', async () => {
      const owner = await seedUser(db.prisma);
      const joiner = await seedUser(db.prisma);
      const trip = await newTrip(owner.id);
      const invite = await issueInvite(trip.id, owner.id, 5);

      const outcome = await invites.redeem(invite.id, joiner.id);

      expect(outcome.status).toBe('joined');
      expect((await db.prisma.tripInvite.findUnique({ where: { id: invite.id } }))?.useCount).toBe(
        1,
      );
    });

    it('is idempotent and does NOT burn a second use on a double tap', async () => {
      const owner = await seedUser(db.prisma);
      const joiner = await seedUser(db.prisma);
      const trip = await newTrip(owner.id);
      const invite = await issueInvite(trip.id, owner.id, 5);

      await invites.redeem(invite.id, joiner.id);
      const second = await invites.redeem(invite.id, joiner.id);

      expect(second.status).toBe('already-member');
      expect((await db.prisma.tripInvite.findUnique({ where: { id: invite.id } }))?.useCount).toBe(
        1,
      );
    });

    it('lets exactly ONE of two concurrent redemptions take the last use', async () => {
      // The whole reason the use limit is enforced inside the transaction. Both
      // callers pass the use case's earlier validity check; only the database can
      // decide who wins.
      const owner = await seedUser(db.prisma);
      const first = await seedUser(db.prisma);
      const second = await seedUser(db.prisma);
      const trip = await newTrip(owner.id);
      const invite = await issueInvite(trip.id, owner.id, 1);

      const results = await Promise.allSettled([
        invites.redeem(invite.id, first.id),
        invites.redeem(invite.id, second.id),
      ]);

      const joined = results.filter((r) => r.status === 'fulfilled');
      const refused = results.filter((r) => r.status === 'rejected');

      expect(joined).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect((await db.prisma.tripInvite.findUnique({ where: { id: invite.id } }))?.useCount).toBe(
        1,
      );
      // Owner plus exactly one joiner.
      expect(await db.prisma.tripMembership.count({ where: { tripId: trip.id } })).toBe(2);
    });

    it('reinstates a previously removed member rather than failing the unique constraint', async () => {
      const owner = await seedUser(db.prisma);
      const rejoiner = await seedUser(db.prisma);
      const trip = await newTrip(owner.id);
      const invite = await issueInvite(trip.id, owner.id, null);

      await invites.redeem(invite.id, rejoiner.id);
      await members.markRemoved(trip.id, rejoiner.id);
      const again = await invites.redeem(invite.id, rejoiner.id);

      expect(again.status).toBe('joined');
      const membership = await db.prisma.tripMembership.findUnique({
        where: { tripId_userId: { tripId: trip.id, userId: rejoiner.id } },
      });
      expect(membership?.status).toBe('ACTIVE');
      expect(membership?.removedAt).toBeNull();
    });

    it('refuses a revoked invite', async () => {
      const owner = await seedUser(db.prisma);
      const joiner = await seedUser(db.prisma);
      const trip = await newTrip(owner.id);
      const invite = await issueInvite(trip.id, owner.id, null);
      await invites.revoke(invite.id, trip.id);

      await expect(invites.redeem(invite.id, joiner.id)).rejects.toThrow();
    });

    it('will not revoke an invite belonging to another trip', async () => {
      const owner = await seedUser(db.prisma);
      const tripA = await newTrip(owner.id);
      const tripB = await newTrip(owner.id);
      const invite = await issueInvite(tripA.id, owner.id, null);

      await invites.revoke(invite.id, tripB.id);

      expect(
        (await db.prisma.tripInvite.findUnique({ where: { id: invite.id } }))?.revokedAt,
      ).toBeNull();
    });
  });

  describe('transferOwnership', () => {
    it('moves ownership and demotes the previous owner atomically', async () => {
      const owner = await seedUser(db.prisma);
      const successor = await seedUser(db.prisma);
      const trip = await newTrip(owner.id);
      await db.prisma.tripMembership.create({
        data: { tripId: trip.id, userId: successor.id, role: 'MEMBER', status: 'ACTIVE' },
      });

      await members.transferOwnership(trip.id, owner.id, successor.id);

      const rows = await db.prisma.tripMembership.findMany({ where: { tripId: trip.id } });
      expect(rows.find((r) => r.userId === successor.id)?.role).toBe('OWNER');
      expect(rows.find((r) => r.userId === owner.id)?.role).toBe('ADMIN');
      // Exactly one owner at all times.
      expect(rows.filter((r) => r.role === 'OWNER')).toHaveLength(1);
    });

    it('leaves the previous owner in place when the target does not exist', async () => {
      // Without a transaction the demotion would land and the promotion would
      // fail, leaving a trip with NO owner — unrecoverable, since only an owner
      // can transfer.
      const owner = await seedUser(db.prisma);
      const trip = await newTrip(owner.id);

      await expect(
        members.transferOwnership(trip.id, owner.id, 'user_not_a_member'),
      ).rejects.toThrow();

      const rows = await db.prisma.tripMembership.findMany({ where: { tripId: trip.id } });
      expect(rows.find((r) => r.userId === owner.id)?.role).toBe('OWNER');
      expect(rows.filter((r) => r.role === 'OWNER')).toHaveLength(1);
    });
  });
});
