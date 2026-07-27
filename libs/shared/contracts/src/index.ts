export { contract } from './lib/contract';
export type { AppContract } from './lib/contract';

export { systemContract, systemStatusOutputSchema } from './lib/system.contract';
export type { SystemStatus } from './lib/system.contract';

export {
  acceptInviteInputSchema,
  acceptInviteResultSchema,
  createInviteInputSchema,
  createTripInputSchema,
  createdInviteSchema,
  tripRoleSchema,
  tripStatusSchema,
  tripMemberSchema,
  tripSummarySchema,
  tripsContract,
} from './lib/trips.contract';
export type { CreateTripInputDto, TripMemberDto, TripSummaryDto } from './lib/trips.contract';
