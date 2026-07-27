import type { PollKind } from '@tripos/api/polls/domain';
import type {
  CreatePollInput,
  PollOptionRecord,
  PollRecord,
  PollRepository,
} from '@tripos/api/polls/application';
import type { PrismaClient } from '@tripos/shared/database';

const POLL_SELECT = {
  id: true,
  tripId: true,
  subject: true,
  kind: true,
  status: true,
  question: true,
  closesAt: true,
  allowMemberOptions: true,
  decidedOptionId: true,
  createdById: true,
  createdAt: true,
  options: {
    select: {
      id: true,
      label: true,
      description: true,
      url: true,
      startDate: true,
      endDate: true,
      createdById: true,
    },
    orderBy: { createdAt: 'asc' },
  },
  votes: { select: { optionId: true, userId: true } },
} as const;

export class PrismaPollRepository implements PollRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Poll and options in one write — a poll with no options is unusable. */
  async create(input: CreatePollInput): Promise<PollRecord> {
    return this.prisma.poll.create({
      data: {
        tripId: input.tripId,
        subject: input.subject,
        kind: input.kind,
        question: input.question,
        closesAt: input.closesAt,
        allowMemberOptions: input.allowMemberOptions,
        createdById: input.createdById,
        options: {
          create: input.options.map((option) => ({
            label: option.label,
            description: option.description,
            url: option.url,
            startDate: option.startDate,
            endDate: option.endDate,
            createdById: input.createdById,
          })),
        },
      },
      select: POLL_SELECT,
    });
  }

  async listForTrip(tripId: string): Promise<PollRecord[]> {
    // Scoped by tripId, as every trip-scoped query must be (CLAUDE.md §7).
    return this.prisma.poll.findMany({
      where: { tripId, deletedAt: null },
      select: POLL_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(pollId: string, tripId: string): Promise<PollRecord | null> {
    // tripId is in the WHERE clause, not just checked afterwards: a poll id from
    // another trip must not resolve at all.
    return this.prisma.poll.findFirst({
      where: { id: pollId, tripId, deletedAt: null },
      select: POLL_SELECT,
    });
  }

  async addOption(pollId: string, option: Omit<PollOptionRecord, 'id'>): Promise<PollOptionRecord> {
    return this.prisma.pollOption.create({
      data: { pollId, ...option },
      select: {
        id: true,
        label: true,
        description: true,
        url: true,
        startDate: true,
        endDate: true,
        createdById: true,
      },
    });
  }

  /**
   * Records a vote.
   *
   * For SINGLE_CHOICE the voter's other votes are cleared in the SAME
   * transaction as the new one. Two statements outside a transaction would leave
   * a window where the voter has zero votes (or, if reordered, two) — and a
   * tally read in that window is simply wrong.
   */
  async castVote(pollId: string, optionId: string, userId: string, kind: PollKind): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (kind === 'SINGLE_CHOICE') {
        await tx.vote.deleteMany({ where: { pollId, userId, optionId: { not: optionId } } });
      }

      // Upsert on the (optionId, userId) unique index, so double-tapping the
      // same option is a no-op rather than a duplicate-key error.
      await tx.vote.upsert({
        where: { optionId_userId: { optionId, userId } },
        create: { pollId, optionId, userId },
        update: {},
      });
    });
  }

  async retractVote(pollId: string, optionId: string, userId: string): Promise<void> {
    // deleteMany rather than delete: retracting a vote you no longer have is a
    // no-op, not an error.
    await this.prisma.vote.deleteMany({ where: { pollId, optionId, userId } });
  }

  async close(pollId: string, decidedOptionId: string | null): Promise<void> {
    await this.prisma.poll.update({
      where: { id: pollId },
      data: { status: 'CLOSED', decidedOptionId, closedAt: new Date() },
    });
  }
}
