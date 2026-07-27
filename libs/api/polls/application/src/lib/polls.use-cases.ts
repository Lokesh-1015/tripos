import type { TripActor } from '@tripos/api/shared/authz';
import { hasAtLeastRole } from '@tripos/api/shared/authz';
import {
  checkCanVote,
  resolveWinner,
  tallyVotes,
  type PollKind,
  type PollSubject,
  type Tally,
} from '@tripos/api/polls/domain';
import type { PollRecord, PollRepository } from './poll-repository.port';

export class PollNotFoundError extends Error {
  constructor() {
    super('Poll not found');
    this.name = 'PollNotFoundError';
  }
}

export class PollActionDeniedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PollActionDeniedError';
  }
}

export class InvalidPollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPollError';
  }
}

export interface PollView extends PollRecord {
  readonly tally: Tally;
  /** Option ids the requesting user has voted for. */
  readonly myVotes: string[];
  readonly isAcceptingVotes: boolean;
}

function toView(poll: PollRecord, userId: string, now: Date): PollView {
  return {
    ...poll,
    tally: tallyVotes(
      poll.options.map((option) => option.id),
      poll.votes,
    ),
    myVotes: poll.votes.filter((vote) => vote.userId === userId).map((vote) => vote.optionId),
    isAcceptingVotes: checkCanVote(poll, now).canVote,
  };
}

export interface CreatePollCommand {
  readonly tripId: string;
  readonly subject: PollSubject;
  readonly kind: PollKind;
  readonly question: string;
  readonly closesAt: Date | null;
  readonly allowMemberOptions: boolean;
  readonly options: ReadonlyArray<{
    label: string;
    description?: string | null;
    url?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
  }>;
  readonly actorUserId: string;
}

export class CreatePollUseCase {
  constructor(
    private readonly polls: PollRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: CreatePollCommand): Promise<PollRecord> {
    const question = command.question.trim();
    if (question.length === 0) {
      throw new InvalidPollError('A poll needs a question');
    }

    // Two options is the minimum that constitutes a choice. One option is an
    // announcement, and voting on it tells the group nothing.
    if (command.options.length < 2) {
      throw new InvalidPollError('A poll needs at least two options');
    }

    if (command.closesAt && command.closesAt.getTime() <= this.now().getTime()) {
      throw new InvalidPollError('A poll deadline must be in the future');
    }

    return this.polls.create({
      tripId: command.tripId,
      subject: command.subject,
      kind: command.kind,
      question,
      closesAt: command.closesAt,
      allowMemberOptions: command.allowMemberOptions,
      createdById: command.actorUserId,
      options: command.options.map((option) => ({
        label: option.label.trim(),
        description: option.description?.trim() || null,
        url: option.url?.trim() || null,
        startDate: option.startDate ?? null,
        endDate: option.endDate ?? null,
      })),
    });
  }
}

export class ListPollsUseCase {
  constructor(
    private readonly polls: PollRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(tripId: string, actorUserId: string): Promise<PollView[]> {
    const polls = await this.polls.listForTrip(tripId);

    return polls.map((poll) => toView(poll, actorUserId, this.now()));
  }
}

export class CastVoteUseCase {
  constructor(
    private readonly polls: PollRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: TripActor, pollId: string, optionId: string): Promise<PollView> {
    const poll = await this.requirePoll(pollId, actor.tripId);

    // VIEWERs read everything and change nothing — voting is a change.
    if (!hasAtLeastRole(actor.role, 'MEMBER')) {
      throw new PollActionDeniedError('Viewers cannot vote');
    }

    const votable = checkCanVote(poll, this.now());
    if (!votable.canVote) {
      throw new PollActionDeniedError(votable.reason);
    }

    if (!poll.options.some((option) => option.id === optionId)) {
      throw new InvalidPollError('That option is not part of this poll');
    }

    // For SINGLE_CHOICE the repository clears the voter's other votes in the
    // same transaction, which is what makes changing your mind work.
    await this.polls.castVote(pollId, optionId, actor.userId, poll.kind);

    return this.reload(pollId, actor);
  }

  private async requirePoll(pollId: string, tripId: string): Promise<PollRecord> {
    const poll = await this.polls.findById(pollId, tripId);
    if (!poll) throw new PollNotFoundError();
    return poll;
  }

  private async reload(pollId: string, actor: TripActor): Promise<PollView> {
    const poll = await this.requirePoll(pollId, actor.tripId);
    return toView(poll, actor.userId, this.now());
  }
}

export class RetractVoteUseCase {
  constructor(
    private readonly polls: PollRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: TripActor, pollId: string, optionId: string): Promise<PollView> {
    const poll = await this.polls.findById(pollId, actor.tripId);
    if (!poll) throw new PollNotFoundError();

    const votable = checkCanVote(poll, this.now());
    if (!votable.canVote) {
      throw new PollActionDeniedError(votable.reason);
    }

    await this.polls.retractVote(pollId, optionId, actor.userId);

    const reloaded = await this.polls.findById(pollId, actor.tripId);
    if (!reloaded) throw new PollNotFoundError();

    return toView(reloaded, actor.userId, this.now());
  }
}

export class AddPollOptionUseCase {
  constructor(private readonly polls: PollRepository) {}

  async execute(
    actor: TripActor,
    pollId: string,
    option: {
      label: string;
      description?: string | null;
      url?: string | null;
      startDate?: Date | null;
      endDate?: Date | null;
    },
  ): Promise<void> {
    const poll = await this.polls.findById(pollId, actor.tripId);
    if (!poll) throw new PollNotFoundError();

    if (poll.status === 'CLOSED') {
      throw new PollActionDeniedError('This poll has been closed');
    }

    // Members may add options only when the organiser allowed it; admins always
    // can, since they own the poll's shape.
    const isOrganiser = hasAtLeastRole(actor.role, 'ADMIN');
    if (!isOrganiser && !poll.allowMemberOptions) {
      throw new PollActionDeniedError('Only the organiser can add options to this poll');
    }
    if (!hasAtLeastRole(actor.role, 'MEMBER')) {
      throw new PollActionDeniedError('Viewers cannot add options');
    }

    const label = option.label.trim();
    if (label.length === 0) {
      throw new InvalidPollError('An option needs a label');
    }

    await this.polls.addOption(pollId, {
      label,
      description: option.description?.trim() || null,
      url: option.url?.trim() || null,
      startDate: option.startDate ?? null,
      endDate: option.endDate ?? null,
      createdById: actor.userId,
    });
  }
}

/**
 * Closes a poll and records the decision.
 *
 * The decision is the point: closing without recording an outcome would leave
 * the group exactly where they started. When the result is tied, this refuses to
 * guess and asks for an explicit choice (see `resolveWinner`).
 */
export class ClosePollUseCase {
  constructor(private readonly polls: PollRepository) {}

  async execute(actor: TripActor, pollId: string, explicitOptionId?: string | null): Promise<void> {
    const poll = await this.polls.findById(pollId, actor.tripId);
    if (!poll) throw new PollNotFoundError();

    // Closing is a decision on the group's behalf: admins, or whoever opened it.
    const isOrganiser = hasAtLeastRole(actor.role, 'ADMIN');
    if (!isOrganiser && poll.createdById !== actor.userId) {
      throw new PollActionDeniedError('Only an organiser or the poll’s author can close it');
    }

    if (poll.status === 'CLOSED') {
      // Idempotent — closing twice is not an error.
      return;
    }

    let decidedOptionId: string | null = null;

    if (explicitOptionId) {
      if (!poll.options.some((option) => option.id === explicitOptionId)) {
        throw new InvalidPollError('That option is not part of this poll');
      }
      decidedOptionId = explicitOptionId;
    } else {
      const tally = tallyVotes(
        poll.options.map((option) => option.id),
        poll.votes,
      );

      // Throws on a tie or on no votes; both need a human, not a default.
      decidedOptionId = resolveWinner(tally);
    }

    await this.polls.close(pollId, decidedOptionId);
  }
}
