import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { AmbiguousPollOutcomeError, NoVotesError } from '@tripos/api/polls/domain';
import {
  AddPollOptionUseCase,
  CastVoteUseCase,
  ClosePollUseCase,
  CreatePollUseCase,
  InvalidPollError,
  ListPollsUseCase,
  PollActionDeniedError,
  PollNotFoundError,
  RetractVoteUseCase,
  type PollView,
} from '@tripos/api/polls/application';
import { CurrentUser, type AuthenticatedUser } from '@tripos/api/shared/auth';
import type { TripActor } from '@tripos/api/shared/authz';
import {
  CurrentTripActor,
  RequiresTripRole,
  TripAccessGuard,
} from '@tripos/api/shared/trip-access';
import { contract, type PollDto } from '@tripos/shared/contracts';
import { Implement, implement } from '@orpc/nest';

const toDateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

/** Folds the tally into each option so the client renders without recomputing. */
function toDto(poll: PollView): PollDto {
  const byOption = new Map(poll.tally.perOption.map((entry) => [entry.optionId, entry]));

  return {
    id: poll.id,
    tripId: poll.tripId,
    subject: poll.subject,
    kind: poll.kind,
    status: poll.status,
    question: poll.question,
    closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    allowMemberOptions: poll.allowMemberOptions,
    decidedOptionId: poll.decidedOptionId,
    createdById: poll.createdById,
    options: poll.options.map((option) => ({
      id: option.id,
      label: option.label,
      description: option.description,
      url: option.url,
      startDate: toDateOnly(option.startDate),
      endDate: toDateOnly(option.endDate),
      votes: byOption.get(option.id)?.votes ?? 0,
      isLeading: byOption.get(option.id)?.isLeading ?? false,
    })),
    voterCount: poll.tally.voterCount,
    isTie: poll.tally.isTie,
    myVotes: poll.myVotes,
    isAcceptingVotes: poll.isAcceptingVotes,
  };
}

/**
 * Poll routes — one controller for all five voting features.
 *
 * Coarse access is the guard's job; who may vote, add options, or close is
 * decided by the use cases, which apply the rules in one place.
 */
@Controller()
@UseGuards(TripAccessGuard)
export class PollsController {
  constructor(
    private readonly createPoll: CreatePollUseCase,
    private readonly listPolls: ListPollsUseCase,
    private readonly addOption: AddPollOptionUseCase,
    private readonly castVote: CastVoteUseCase,
    private readonly retractVote: RetractVoteUseCase,
    private readonly closePoll: ClosePollUseCase,
  ) {}

  @Implement(contract.polls.create)
  @RequiresTripRole('MEMBER')
  create(@CurrentUser() user: AuthenticatedUser) {
    return implement(contract.polls.create).handler(async ({ input }) => {
      const poll = await this.guard(() =>
        this.createPoll.execute({
          tripId: input.tripId,
          subject: input.subject,
          kind: input.kind,
          question: input.question,
          closesAt: input.closesAt ? new Date(input.closesAt) : null,
          allowMemberOptions: input.allowMemberOptions,
          options: input.options.map((option) => ({
            label: option.label,
            description: option.description ?? null,
            url: option.url ?? null,
            startDate: option.startDate ? new Date(option.startDate) : null,
            endDate: option.endDate ? new Date(option.endDate) : null,
          })),
          actorUserId: user.userId,
        }),
      );

      // A freshly created poll has no votes; render it through the same shape.
      return toDto({
        ...poll,
        tally: {
          perOption: poll.options.map((o) => ({ optionId: o.id, votes: 0, isLeading: false })),
          voterCount: 0,
          totalVotes: 0,
          leaders: [],
          isTie: false,
        },
        myVotes: [],
        isAcceptingVotes: true,
      });
    });
  }

  @Implement(contract.polls.list)
  @RequiresTripRole('VIEWER')
  list(@CurrentTripActor() actor: TripActor) {
    return implement(contract.polls.list).handler(async () => {
      const polls = await this.listPolls.execute(actor.tripId, actor.userId);

      return { polls: polls.map(toDto) };
    });
  }

  @Implement(contract.polls.addOption)
  @RequiresTripRole('MEMBER')
  addPollOption(@CurrentTripActor() actor: TripActor) {
    return implement(contract.polls.addOption).handler(async ({ input }) => {
      await this.guard(() =>
        this.addOption.execute(actor, input.pollId, {
          label: input.label,
          description: input.description ?? null,
          url: input.url ?? null,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
        }),
      );

      return { added: true as const };
    });
  }

  @Implement(contract.polls.vote)
  @RequiresTripRole('MEMBER')
  vote(@CurrentTripActor() actor: TripActor) {
    return implement(contract.polls.vote).handler(async ({ input }) => {
      const poll = await this.guard(() =>
        this.castVote.execute(actor, input.pollId, input.optionId),
      );

      return toDto(poll);
    });
  }

  @Implement(contract.polls.retractVote)
  @RequiresTripRole('MEMBER')
  unvote(@CurrentTripActor() actor: TripActor) {
    return implement(contract.polls.retractVote).handler(async ({ input }) => {
      const poll = await this.guard(() =>
        this.retractVote.execute(actor, input.pollId, input.optionId),
      );

      return toDto(poll);
    });
  }

  @Implement(contract.polls.close)
  @RequiresTripRole('MEMBER')
  close(@CurrentTripActor() actor: TripActor) {
    return implement(contract.polls.close).handler(async ({ input }) => {
      await this.guard(() => this.closePoll.execute(actor, input.pollId, input.optionId ?? null));

      return { closed: true as const };
    });
  }

  /**
   * Maps domain failures onto HTTP.
   *
   * A tie is 409 Conflict rather than 400: the request was perfectly valid, the
   * *state* is what prevents it, and the client's correct response is to ask the
   * user which option should win — not to fix its payload.
   */
  private async guard<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof PollNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof PollActionDeniedError) throw new ForbiddenException(error.message);
      if (error instanceof AmbiguousPollOutcomeError) throw new ConflictException(error.message);
      if (error instanceof NoVotesError) throw new ConflictException(error.message);
      if (error instanceof InvalidPollError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
