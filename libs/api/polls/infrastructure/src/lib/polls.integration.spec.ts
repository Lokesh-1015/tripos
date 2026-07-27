import { seedUser, startTestDatabase, type TestDatabase } from '@tripos/api/shared/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaPollRepository } from './prisma-poll.repository';

/**
 * Integration tests against a REAL Postgres (CLAUDE.md §12).
 *
 * The behaviour under test is the vote-replacement transaction: a unit test with
 * a fake repository proves the use case CALLS it, not that the database ends up
 * with one row.
 */
describe('polls infrastructure (integration)', () => {
  let db: TestDatabase;
  let polls: PrismaPollRepository;
  let tripId: string;
  let ownerId: string;

  beforeAll(async () => {
    db = await startTestDatabase();
    polls = new PrismaPollRepository(db.prisma);
  }, 180_000);

  afterAll(async () => {
    await db?.stop();
  }, 60_000);

  beforeEach(async () => {
    await db.reset();

    const owner = await seedUser(db.prisma);
    ownerId = owner.id;

    const trip = await db.prisma.trip.create({
      data: {
        name: 'Goa 2026',
        timezone: 'Asia/Kolkata',
        baseCurrency: 'INR',
        createdById: ownerId,
        memberships: { create: { userId: ownerId, role: 'OWNER', status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    tripId = trip.id;
  });

  const newPoll = async (kind: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE') =>
    polls.create({
      tripId,
      subject: 'DESTINATION',
      kind,
      question: 'Where to?',
      closesAt: null,
      allowMemberOptions: true,
      createdById: ownerId,
      options: [
        { label: 'Goa', description: null, url: null, startDate: null, endDate: null },
        { label: 'Kerala', description: null, url: null, startDate: null, endDate: null },
      ],
    });

  it('creates the poll and its options in one write', async () => {
    const poll = await newPoll('SINGLE_CHOICE');

    expect(poll.options).toHaveLength(2);
    expect(await db.prisma.pollOption.count({ where: { pollId: poll.id } })).toBe(2);
  });

  it('replaces the previous vote on a single-choice poll', async () => {
    const poll = await newPoll('SINGLE_CHOICE');
    const [goa, kerala] = poll.options;
    if (!goa || !kerala) throw new Error('expected two options');

    await polls.castVote(poll.id, goa.id, ownerId, 'SINGLE_CHOICE');
    await polls.castVote(poll.id, kerala.id, ownerId, 'SINGLE_CHOICE');

    // Exactly one row survives — changing your mind must not double-count.
    const votes = await db.prisma.vote.findMany({ where: { pollId: poll.id, userId: ownerId } });
    expect(votes).toHaveLength(1);
    expect(votes[0]?.optionId).toBe(kerala.id);
  });

  it('accumulates votes on a multiple-choice poll', async () => {
    const poll = await newPoll('MULTIPLE_CHOICE');
    const [goa, kerala] = poll.options;
    if (!goa || !kerala) throw new Error('expected two options');

    await polls.castVote(poll.id, goa.id, ownerId, 'MULTIPLE_CHOICE');
    await polls.castVote(poll.id, kerala.id, ownerId, 'MULTIPLE_CHOICE');

    expect(await db.prisma.vote.count({ where: { pollId: poll.id, userId: ownerId } })).toBe(2);
  });

  it('treats a repeated vote for the same option as a no-op', async () => {
    const poll = await newPoll('MULTIPLE_CHOICE');
    const [goa] = poll.options;
    if (!goa) throw new Error('expected an option');

    await polls.castVote(poll.id, goa.id, ownerId, 'MULTIPLE_CHOICE');
    // Double-tapping must not raise a unique-constraint error.
    await expect(
      polls.castVote(poll.id, goa.id, ownerId, 'MULTIPLE_CHOICE'),
    ).resolves.toBeUndefined();

    expect(await db.prisma.vote.count({ where: { pollId: poll.id } })).toBe(1);
  });

  it('keeps voters independent of one another', async () => {
    const poll = await newPoll('SINGLE_CHOICE');
    const other = await seedUser(db.prisma);
    const [goa, kerala] = poll.options;
    if (!goa || !kerala) throw new Error('expected two options');

    await polls.castVote(poll.id, goa.id, ownerId, 'SINGLE_CHOICE');
    await polls.castVote(poll.id, kerala.id, other.id, 'SINGLE_CHOICE');

    // One voter changing their mind must not clear anyone else's vote.
    expect(await db.prisma.vote.count({ where: { pollId: poll.id } })).toBe(2);
  });

  it('retracting a vote you do not have is a no-op, not an error', async () => {
    const poll = await newPoll('SINGLE_CHOICE');
    const [goa] = poll.options;
    if (!goa) throw new Error('expected an option');

    await expect(polls.retractVote(poll.id, goa.id, ownerId)).resolves.toBeUndefined();
  });

  it('does not resolve a poll id belonging to another trip', async () => {
    const poll = await newPoll('SINGLE_CHOICE');
    const otherTrip = await db.prisma.trip.create({
      data: { name: 'Other', timezone: 'UTC', baseCurrency: 'INR', createdById: ownerId },
      select: { id: true },
    });

    // tripId is in the WHERE clause, so a poll from elsewhere is invisible.
    expect(await polls.findById(poll.id, otherTrip.id)).toBeNull();
  });

  it('records the decision when closing', async () => {
    const poll = await newPoll('SINGLE_CHOICE');
    const [goa] = poll.options;
    if (!goa) throw new Error('expected an option');

    await polls.castVote(poll.id, goa.id, ownerId, 'SINGLE_CHOICE');
    await polls.close(poll.id, goa.id);

    const closed = await db.prisma.poll.findUnique({ where: { id: poll.id } });
    expect(closed?.status).toBe('CLOSED');
    expect(closed?.decidedOptionId).toBe(goa.id);
    expect(closed?.closedAt).not.toBeNull();
  });

  it('cascades votes and options when a poll is deleted', async () => {
    const poll = await newPoll('SINGLE_CHOICE');
    const [goa] = poll.options;
    if (!goa) throw new Error('expected an option');
    await polls.castVote(poll.id, goa.id, ownerId, 'SINGLE_CHOICE');

    // The decided-option FK must not block deletion.
    await db.prisma.poll.delete({ where: { id: poll.id } });

    expect(await db.prisma.vote.count()).toBe(0);
    expect(await db.prisma.pollOption.count()).toBe(0);
  });
});
