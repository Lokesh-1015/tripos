import { AmbiguousPollOutcomeError, NoVotesError, type PollKind } from '@tripos/api/polls/domain';
import type { TripActor, TripRole } from '@tripos/api/shared/authz';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  CreatePollInput,
  PollOptionRecord,
  PollRecord,
  PollRepository,
} from './poll-repository.port';
import {
  AddPollOptionUseCase,
  CastVoteUseCase,
  ClosePollUseCase,
  CreatePollUseCase,
  InvalidPollError,
  PollActionDeniedError,
  RetractVoteUseCase,
} from './polls.use-cases';

const NOW = new Date('2026-07-27T12:00:00.000Z');
const hour = 60 * 60 * 1000;

/**
 * A fake that reproduces the repository's real contract, including the
 * single-choice vote replacement. Testing against a mock that merely records
 * calls would prove nothing about whether changing your vote works.
 */
class FakePollRepository implements PollRepository {
  poll: PollRecord;

  constructor(overrides: Partial<PollRecord> = {}) {
    this.poll = {
      id: 'poll_1',
      tripId: 'trip_1',
      subject: 'DESTINATION',
      kind: 'SINGLE_CHOICE',
      status: 'OPEN',
      question: 'Where to?',
      closesAt: null,
      allowMemberOptions: true,
      decidedOptionId: null,
      createdById: 'owner',
      createdAt: NOW,
      options: [
        {
          id: 'goa',
          label: 'Goa',
          description: null,
          url: null,
          startDate: null,
          endDate: null,
          createdById: 'owner',
        },
        {
          id: 'kerala',
          label: 'Kerala',
          description: null,
          url: null,
          startDate: null,
          endDate: null,
          createdById: 'owner',
        },
      ],
      votes: [],
      ...overrides,
    };
  }

  async create(input: CreatePollInput): Promise<PollRecord> {
    this.poll = {
      ...this.poll,
      subject: input.subject,
      kind: input.kind,
      question: input.question,
      closesAt: input.closesAt,
      allowMemberOptions: input.allowMemberOptions,
      createdById: input.createdById,
      options: input.options.map((option, index) => ({
        id: `opt_${index}`,
        ...option,
        createdById: input.createdById,
      })),
      votes: [],
    };
    return this.poll;
  }

  async listForTrip(): Promise<PollRecord[]> {
    return [this.poll];
  }

  async findById(pollId: string, tripId: string): Promise<PollRecord | null> {
    return pollId === this.poll.id && tripId === this.poll.tripId ? this.poll : null;
  }

  async addOption(
    _pollId: string,
    option: Omit<PollOptionRecord, 'id'>,
  ): Promise<PollOptionRecord> {
    const created = { id: `opt_${this.poll.options.length}`, ...option };
    this.poll = { ...this.poll, options: [...this.poll.options, created] };
    return created;
  }

  async castVote(_pollId: string, optionId: string, userId: string, kind: PollKind): Promise<void> {
    // Single choice replaces; multiple choice accumulates. This mirrors what the
    // Prisma implementation must do inside one transaction.
    const others =
      kind === 'SINGLE_CHOICE'
        ? this.poll.votes.filter((vote) => vote.userId !== userId)
        : this.poll.votes.filter((vote) => !(vote.userId === userId && vote.optionId === optionId));

    this.poll = { ...this.poll, votes: [...others, { optionId, userId }] };
  }

  async retractVote(_pollId: string, optionId: string, userId: string): Promise<void> {
    this.poll = {
      ...this.poll,
      votes: this.poll.votes.filter((v) => !(v.userId === userId && v.optionId === optionId)),
    };
  }

  async close(_pollId: string, decidedOptionId: string | null): Promise<void> {
    this.poll = { ...this.poll, status: 'CLOSED', decidedOptionId };
  }
}

const actor = (userId: string, role: TripRole = 'MEMBER'): TripActor => ({
  userId,
  tripId: 'trip_1',
  role,
  status: 'ACTIVE',
});

describe('CreatePollUseCase', () => {
  let repo: FakePollRepository;
  let useCase: CreatePollUseCase;

  const command = {
    tripId: 'trip_1',
    subject: 'DESTINATION' as const,
    kind: 'SINGLE_CHOICE' as const,
    question: 'Where to?',
    closesAt: null,
    allowMemberOptions: true,
    options: [{ label: 'Goa' }, { label: 'Kerala' }],
    actorUserId: 'owner',
  };

  beforeEach(() => {
    repo = new FakePollRepository();
    useCase = new CreatePollUseCase(repo, () => NOW);
  });

  it('creates a poll with its options', async () => {
    const poll = await useCase.execute(command);

    expect(poll.options).toHaveLength(2);
  });

  it('rejects a poll with fewer than two options — one choice is an announcement', async () => {
    await expect(useCase.execute({ ...command, options: [{ label: 'Goa' }] })).rejects.toThrow(
      InvalidPollError,
    );
  });

  it('rejects a blank question', async () => {
    await expect(useCase.execute({ ...command, question: '   ' })).rejects.toThrow(
      /needs a question/i,
    );
  });

  it('rejects a deadline in the past', async () => {
    await expect(
      useCase.execute({ ...command, closesAt: new Date(NOW.getTime() - hour) }),
    ).rejects.toThrow(/must be in the future/i);
  });

  it('works for every subject — one primitive, five features', async () => {
    for (const subject of ['DATES', 'ACTIVITY', 'RESTAURANT', 'ACCOMMODATION'] as const) {
      const poll = await useCase.execute({ ...command, subject });
      expect(poll.subject).toBe(subject);
    }
  });
});

describe('CastVoteUseCase', () => {
  let repo: FakePollRepository;
  let useCase: CastVoteUseCase;

  beforeEach(() => {
    repo = new FakePollRepository();
    useCase = new CastVoteUseCase(repo, () => NOW);
  });

  it('records a vote and returns the updated tally', async () => {
    const view = await useCase.execute(actor('u1'), 'poll_1', 'goa');

    expect(view.tally.perOption.find((o) => o.optionId === 'goa')?.votes).toBe(1);
    expect(view.myVotes).toEqual(['goa']);
  });

  it('replaces the previous vote on a single-choice poll', async () => {
    await useCase.execute(actor('u1'), 'poll_1', 'goa');
    const view = await useCase.execute(actor('u1'), 'poll_1', 'kerala');

    // Changing your mind must not leave two votes behind.
    expect(view.tally.totalVotes).toBe(1);
    expect(view.myVotes).toEqual(['kerala']);
  });

  it('accumulates votes on a multiple-choice poll', async () => {
    repo.poll = { ...repo.poll, kind: 'MULTIPLE_CHOICE' };

    await useCase.execute(actor('u1'), 'poll_1', 'goa');
    const view = await useCase.execute(actor('u1'), 'poll_1', 'kerala');

    expect(view.tally.totalVotes).toBe(2);
    expect(view.tally.voterCount).toBe(1);
    expect(view.myVotes.sort()).toEqual(['goa', 'kerala']);
  });

  it('refuses a viewer', async () => {
    await expect(useCase.execute(actor('u1', 'VIEWER'), 'poll_1', 'goa')).rejects.toThrow(
      /viewers cannot vote/i,
    );
  });

  it('refuses once the poll is closed', async () => {
    repo.poll = { ...repo.poll, status: 'CLOSED' };

    await expect(useCase.execute(actor('u1'), 'poll_1', 'goa')).rejects.toThrow(
      PollActionDeniedError,
    );
  });

  it('refuses once the deadline has passed, even while status is OPEN', async () => {
    repo.poll = { ...repo.poll, closesAt: new Date(NOW.getTime() - 1) };

    await expect(useCase.execute(actor('u1'), 'poll_1', 'goa')).rejects.toThrow(/voting.*ended/i);
  });

  it('rejects an option from another poll', async () => {
    await expect(useCase.execute(actor('u1'), 'poll_1', 'not-an-option')).rejects.toThrow(
      InvalidPollError,
    );
  });
});

describe('RetractVoteUseCase', () => {
  it('removes the vote', async () => {
    const repo = new FakePollRepository();
    await new CastVoteUseCase(repo, () => NOW).execute(actor('u1'), 'poll_1', 'goa');

    const view = await new RetractVoteUseCase(repo, () => NOW).execute(
      actor('u1'),
      'poll_1',
      'goa',
    );

    expect(view.tally.totalVotes).toBe(0);
    expect(view.myVotes).toEqual([]);
  });
});

describe('AddPollOptionUseCase', () => {
  it('lets a member add an option when the organiser allowed it', async () => {
    const repo = new FakePollRepository();

    await new AddPollOptionUseCase(repo).execute(actor('u1'), 'poll_1', { label: 'Ooty' });

    expect(repo.poll.options.map((o) => o.label)).toContain('Ooty');
  });

  it('blocks a member when the organiser locked the options', async () => {
    const repo = new FakePollRepository({ allowMemberOptions: false });

    await expect(
      new AddPollOptionUseCase(repo).execute(actor('u1'), 'poll_1', { label: 'Ooty' }),
    ).rejects.toThrow(/only the organiser/i);
  });

  it('still lets an admin add options to a locked poll', async () => {
    const repo = new FakePollRepository({ allowMemberOptions: false });

    await expect(
      new AddPollOptionUseCase(repo).execute(actor('a', 'ADMIN'), 'poll_1', { label: 'Ooty' }),
    ).resolves.toBeUndefined();
  });

  it('refuses a viewer', async () => {
    const repo = new FakePollRepository();

    await expect(
      new AddPollOptionUseCase(repo).execute(actor('v', 'VIEWER'), 'poll_1', { label: 'X' }),
    ).rejects.toThrow(PollActionDeniedError);
  });
});

describe('ClosePollUseCase', () => {
  let repo: FakePollRepository;
  let close: ClosePollUseCase;
  let vote: CastVoteUseCase;

  beforeEach(() => {
    repo = new FakePollRepository();
    close = new ClosePollUseCase(repo);
    vote = new CastVoteUseCase(repo, () => NOW);
  });

  it('records the winning option as the decision', async () => {
    await vote.execute(actor('u1'), 'poll_1', 'goa');

    await close.execute(actor('owner', 'ADMIN'), 'poll_1');

    expect(repo.poll.status).toBe('CLOSED');
    expect(repo.poll.decidedOptionId).toBe('goa');
  });

  it('refuses to guess a tie', async () => {
    await vote.execute(actor('u1'), 'poll_1', 'goa');
    await vote.execute(actor('u2'), 'poll_1', 'kerala');

    await expect(close.execute(actor('owner', 'ADMIN'), 'poll_1')).rejects.toThrow(
      AmbiguousPollOutcomeError,
    );
    expect(repo.poll.status).toBe('OPEN');
  });

  it('accepts an explicit choice to break a tie', async () => {
    await vote.execute(actor('u1'), 'poll_1', 'goa');
    await vote.execute(actor('u2'), 'poll_1', 'kerala');

    await close.execute(actor('owner', 'ADMIN'), 'poll_1', 'goa');

    expect(repo.poll.decidedOptionId).toBe('goa');
  });

  it('refuses to close a poll nobody voted in', async () => {
    await expect(close.execute(actor('owner', 'ADMIN'), 'poll_1')).rejects.toThrow(NoVotesError);
  });

  it("lets the poll's author close it even without being an admin", async () => {
    await vote.execute(actor('u1'), 'poll_1', 'goa');

    await expect(close.execute(actor('owner', 'MEMBER'), 'poll_1')).resolves.toBeUndefined();
  });

  it('blocks an unrelated member', async () => {
    await vote.execute(actor('u1'), 'poll_1', 'goa');

    await expect(close.execute(actor('someone-else', 'MEMBER'), 'poll_1')).rejects.toThrow(
      PollActionDeniedError,
    );
  });

  it('is idempotent', async () => {
    await vote.execute(actor('u1'), 'poll_1', 'goa');
    await close.execute(actor('owner', 'ADMIN'), 'poll_1');

    await expect(close.execute(actor('owner', 'ADMIN'), 'poll_1')).resolves.toBeUndefined();
  });
});
