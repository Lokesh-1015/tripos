import {
  canChangeMemberRole,
  canLeaveTrip,
  canRemoveMember,
  canTransferOwnership,
  type PolicyResult,
  type TripActor,
  type TripRole,
} from '@tripos/api/shared/authz';
import type { TripMemberRepository, TripMemberView } from './trip-member-repository.port';

/**
 * Raised when a policy denies an action. Carries the policy's own reason, so the
 * HTTP layer can return something a user can act on rather than "Forbidden".
 */
export class MemberActionDeniedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'MemberActionDeniedError';
  }
}

export class MemberNotFoundError extends Error {
  constructor() {
    super('That person is not a member of this trip');
    this.name = 'MemberNotFoundError';
  }
}

function enforce(result: PolicyResult): void {
  if (!result.allowed) {
    throw new MemberActionDeniedError(result.reason);
  }
}

export class ListMembersUseCase {
  constructor(private readonly members: TripMemberRepository) {}

  async execute(tripId: string): Promise<TripMemberView[]> {
    return this.members.listActive(tripId);
  }
}

/**
 * Every use case below follows the same shape: load the target as an actor, ask
 * the policy, act. The rules themselves live in `api/shared/authz` and are
 * unit-tested there in isolation — these classes only orchestrate (ADR-0006).
 */
export class RemoveMemberUseCase {
  constructor(private readonly members: TripMemberRepository) {}

  async execute(actor: TripActor, targetUserId: string): Promise<void> {
    const target = await this.members.findActor(actor.tripId, targetUserId);
    if (!target) throw new MemberNotFoundError();

    enforce(canRemoveMember(actor, target));

    await this.members.markRemoved(actor.tripId, targetUserId);
  }
}

export class ChangeMemberRoleUseCase {
  constructor(private readonly members: TripMemberRepository) {}

  async execute(actor: TripActor, targetUserId: string, newRole: TripRole): Promise<void> {
    const target = await this.members.findActor(actor.tripId, targetUserId);
    if (!target) throw new MemberNotFoundError();

    enforce(canChangeMemberRole(actor, target, newRole));

    await this.members.updateRole(actor.tripId, targetUserId, newRole);
  }
}

export class LeaveTripUseCase {
  constructor(private readonly members: TripMemberRepository) {}

  async execute(actor: TripActor): Promise<void> {
    // The owner is blocked here: leaving would orphan the trip, with nobody able
    // to manage members or settle it. They must transfer ownership first.
    enforce(canLeaveTrip(actor));

    await this.members.markRemoved(actor.tripId, actor.userId);
  }
}

export class TransferOwnershipUseCase {
  constructor(private readonly members: TripMemberRepository) {}

  async execute(actor: TripActor, targetUserId: string): Promise<void> {
    const target = await this.members.findActor(actor.tripId, targetUserId);
    if (!target) throw new MemberNotFoundError();

    enforce(canTransferOwnership(actor, target));

    await this.members.transferOwnership(actor.tripId, actor.userId, targetUserId);
  }
}
