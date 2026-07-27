import { Module } from '@nestjs/common';
import {
  AddPollOptionUseCase,
  CastVoteUseCase,
  ClosePollUseCase,
  CreatePollUseCase,
  ListPollsUseCase,
  POLL_REPOSITORY,
  RetractVoteUseCase,
  type PollRepository,
} from '@tripos/api/polls/application';
import { PrismaPollRepository } from '@tripos/api/polls/infrastructure';
import { PRISMA, PrismaModule } from '@tripos/api/shared/database';
import type { PrismaClient } from '@tripos/shared/database';
import { PollsController } from './polls.controller';

/** Composition root for the polls domain — binds each port to its adapter. */
@Module({
  imports: [PrismaModule],
  controllers: [PollsController],
  providers: [
    {
      provide: POLL_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaPollRepository(prisma),
      inject: [PRISMA],
    },
    {
      provide: CreatePollUseCase,
      useFactory: (polls: PollRepository) => new CreatePollUseCase(polls),
      inject: [POLL_REPOSITORY],
    },
    {
      provide: ListPollsUseCase,
      useFactory: (polls: PollRepository) => new ListPollsUseCase(polls),
      inject: [POLL_REPOSITORY],
    },
    {
      provide: AddPollOptionUseCase,
      useFactory: (polls: PollRepository) => new AddPollOptionUseCase(polls),
      inject: [POLL_REPOSITORY],
    },
    {
      provide: CastVoteUseCase,
      useFactory: (polls: PollRepository) => new CastVoteUseCase(polls),
      inject: [POLL_REPOSITORY],
    },
    {
      provide: RetractVoteUseCase,
      useFactory: (polls: PollRepository) => new RetractVoteUseCase(polls),
      inject: [POLL_REPOSITORY],
    },
    {
      provide: ClosePollUseCase,
      useFactory: (polls: PollRepository) => new ClosePollUseCase(polls),
      inject: [POLL_REPOSITORY],
    },
  ],
})
export class PollsModule {}
