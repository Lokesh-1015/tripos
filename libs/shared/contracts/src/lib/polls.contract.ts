import { oc } from '@orpc/contract';
import { z } from 'zod';

/**
 * Poll contracts.
 *
 * ONE contract serves destination, date, activity, restaurant and accommodation
 * voting — PRD §9 lists those as five features, but they differ only by
 * `subject` (docs/prd-review.md §4.4). Five contracts would mean five sets of
 * tie-handling and deadline bugs.
 */
export const pollSubjectSchema = z.enum([
  'DESTINATION',
  'DATES',
  'ACTIVITY',
  'RESTAURANT',
  'ACCOMMODATION',
  'GENERAL',
]);

export const pollKindSchema = z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE']);
export const pollStatusSchema = z.enum(['OPEN', 'CLOSED']);

const dateOnly = z.iso.date();

export const pollOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  url: z.url().nullable(),
  /** Populated only for DATES polls. */
  startDate: dateOnly.nullable(),
  endDate: dateOnly.nullable(),
  votes: z.number().int().nonnegative(),
  isLeading: z.boolean(),
});

export const pollSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  subject: pollSubjectSchema,
  kind: pollKindSchema,
  status: pollStatusSchema,
  question: z.string(),
  closesAt: z.iso.datetime().nullable(),
  allowMemberOptions: z.boolean(),
  decidedOptionId: z.string().nullable(),
  createdById: z.string(),
  options: z.array(pollOptionSchema),
  /** Distinct people who voted — not vote count, which approval voting inflates. */
  voterCount: z.number().int().nonnegative(),
  isTie: z.boolean(),
  /** Option ids the caller has voted for. */
  myVotes: z.array(z.string()),
  /** False once closed OR past its deadline, whichever comes first. */
  isAcceptingVotes: z.boolean(),

  /**
   * What THIS caller may do, decided server-side by the same rules the write
   * paths enforce. The client renders from these rather than re-deriving them
   * from role and status — a second copy of the policy would drift from the
   * first, and the drift would show up as buttons that fail when pressed.
   *
   * They remain a convenience, never the enforcement: every action is
   * re-checked on the server (ADR-0006).
   */
  canVote: z.boolean(),
  canAddOptions: z.boolean(),
  canClose: z.boolean(),
});

export type PollDto = z.infer<typeof pollSchema>;

const optionInputSchema = z.object({
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).nullish(),
  url: z.url().nullish(),
  startDate: dateOnly.nullish(),
  endDate: dateOnly.nullish(),
});

export const pollsContract = {
  create: oc
    .route({
      method: 'POST',
      path: '/trips/{tripId}/polls',
      summary: 'Create a poll',
      tags: ['polls'],
    })
    .input(
      z.object({
        tripId: z.string(),
        subject: pollSubjectSchema,
        kind: pollKindSchema.default('SINGLE_CHOICE'),
        question: z.string().trim().min(1).max(300),
        closesAt: z.iso.datetime().nullish(),
        allowMemberOptions: z.boolean().default(true),
        options: z.array(optionInputSchema).min(2, 'A poll needs at least two options'),
      }),
    )
    .output(pollSchema),

  list: oc
    .route({ method: 'GET', path: '/trips/{tripId}/polls', summary: 'List polls', tags: ['polls'] })
    .input(z.object({ tripId: z.string() }))
    .output(z.object({ polls: z.array(pollSchema) })),

  addOption: oc
    .route({
      method: 'POST',
      path: '/trips/{tripId}/polls/{pollId}/options',
      summary: 'Add an option to a poll',
      tags: ['polls'],
    })
    .input(optionInputSchema.extend({ tripId: z.string(), pollId: z.string() }))
    .output(z.object({ added: z.literal(true) })),

  vote: oc
    .route({
      method: 'POST',
      path: '/trips/{tripId}/polls/{pollId}/votes',
      summary: 'Cast a vote',
      tags: ['polls'],
    })
    .input(z.object({ tripId: z.string(), pollId: z.string(), optionId: z.string() }))
    .output(pollSchema),

  retractVote: oc
    .route({
      method: 'DELETE',
      path: '/trips/{tripId}/polls/{pollId}/votes/{optionId}',
      summary: 'Retract a vote',
      tags: ['polls'],
    })
    .input(z.object({ tripId: z.string(), pollId: z.string(), optionId: z.string() }))
    .output(pollSchema),

  close: oc
    .route({
      method: 'POST',
      path: '/trips/{tripId}/polls/{pollId}/close',
      summary: 'Close a poll and record the decision',
      tags: ['polls'],
    })
    .input(
      z.object({
        tripId: z.string(),
        pollId: z.string(),
        /** Required only to break a tie — otherwise the leader is used. */
        optionId: z.string().nullish(),
      }),
    )
    .output(z.object({ closed: z.literal(true) })),
};
