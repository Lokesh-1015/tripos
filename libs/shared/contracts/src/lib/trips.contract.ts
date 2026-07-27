import { oc } from '@orpc/contract';
import { z } from 'zod';

/**
 * Trip contracts.
 *
 * As always, defined once here and derived everywhere: the Nest handlers are
 * type-checked against these shapes, the web client is generated from them, and
 * OpenAPI is emitted from them (ADR-0004, ADR-0009).
 */

export const tripRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
export const tripStatusSchema = z.enum(['DRAFT', 'PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']);

/** ISO-4217: exactly three letters. Money is never a bare number (ADR-0005). */
const currencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Za-z]{3}$/, 'Must be a 3-letter ISO-4217 code')
  .transform((code) => code.toUpperCase());

/**
 * Date-only, never an instant. A trip starting on the 3rd starts on the 3rd in
 * every timezone (CLAUDE.md §9).
 */
const dateOnlySchema = z.iso.date();

export const tripSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  destination: z.string().nullable(),
  timezone: z.string(),
  baseCurrency: z.string(),
  startDate: dateOnlySchema.nullable(),
  endDate: dateOnlySchema.nullable(),
  status: tripStatusSchema,
  memberCount: z.number().int().nonnegative(),
  myRole: tripRoleSchema,
});

export type TripSummaryDto = z.infer<typeof tripSummarySchema>;

export const createTripInputSchema = z.object({
  name: z.string().trim().min(1, 'A trip needs a name').max(120),
  destination: z.string().trim().max(200).nullish(),
  /** IANA zone, e.g. "Asia/Kolkata". Required — itinerary times depend on it. */
  timezone: z.string().min(1),
  baseCurrency: currencySchema.default('INR'),
  startDate: dateOnlySchema.nullish(),
  endDate: dateOnlySchema.nullish(),
});

export type CreateTripInputDto = z.infer<typeof createTripInputSchema>;

export const createInviteInputSchema = z.object({
  /** Never OWNER — ownership is transferred explicitly, not handed out by link. */
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
  email: z.email().nullish(),
  maxUses: z.number().int().min(1).nullish(),
});

export const createdInviteSchema = z.object({
  id: z.string(),
  /** Returned exactly ONCE. Only a hash is stored, so this cannot be re-read. */
  token: z.string(),
  expiresAt: z.iso.datetime(),
});

export const acceptInviteInputSchema = z.object({
  token: z.string().min(1),
});

export const acceptInviteResultSchema = z.object({
  status: z.enum(['joined', 'already-member']),
  tripId: z.string(),
  role: tripRoleSchema,
});

export const tripsContract = {
  create: oc
    .route({ method: 'POST', path: '/trips', summary: 'Create a trip', tags: ['trips'] })
    .input(createTripInputSchema)
    .output(tripSummarySchema),

  list: oc
    .route({ method: 'GET', path: '/trips', summary: 'List my trips', tags: ['trips'] })
    .output(z.object({ trips: z.array(tripSummarySchema) })),

  get: oc
    .route({ method: 'GET', path: '/trips/{tripId}', summary: 'Get a trip', tags: ['trips'] })
    .input(z.object({ tripId: z.string() }))
    .output(tripSummarySchema),

  createInvite: oc
    .route({
      method: 'POST',
      path: '/trips/{tripId}/invites',
      summary: 'Create an invite link',
      tags: ['trips'],
    })
    .input(createInviteInputSchema.extend({ tripId: z.string() }))
    .output(createdInviteSchema),

  acceptInvite: oc
    .route({
      method: 'POST',
      path: '/invites/accept',
      summary: 'Join a trip with an invite token',
      tags: ['trips'],
    })
    .input(acceptInviteInputSchema)
    .output(acceptInviteResultSchema),
};
