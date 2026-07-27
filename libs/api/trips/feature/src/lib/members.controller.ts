import { Controller, ForbiddenException, NotFoundException, UseGuards } from '@nestjs/common';
import type { TripActor } from '@tripos/api/shared/authz';
import {
  CurrentTripActor,
  RequiresTripRole,
  TripAccessGuard,
} from '@tripos/api/shared/trip-access';
import {
  ChangeMemberRoleUseCase,
  LeaveTripUseCase,
  ListMembersUseCase,
  MemberActionDeniedError,
  MemberNotFoundError,
  RemoveMemberUseCase,
  TransferOwnershipUseCase,
} from '@tripos/api/trips/application';
import { contract } from '@tripos/shared/contracts';
import { Implement, implement } from '@orpc/nest';

/**
 * Member management.
 *
 * `@RequiresTripRole` is the coarse gate; the fine-grained rules (who may remove
 * whom, who may grant which role) live in the policies and are applied by the
 * use cases. Note the roles required here are deliberately permissive — VIEWER
 * can list members, and any MEMBER can leave — because the policies do the real
 * work and duplicating them in the decorator would create two places to change.
 */
@Controller()
@UseGuards(TripAccessGuard)
export class MembersController {
  constructor(
    private readonly listMembers: ListMembersUseCase,
    private readonly removeMember: RemoveMemberUseCase,
    private readonly changeRole: ChangeMemberRoleUseCase,
    private readonly leaveTrip: LeaveTripUseCase,
    private readonly transferOwnership: TransferOwnershipUseCase,
  ) {}

  @Implement(contract.trips.listMembers)
  @RequiresTripRole('VIEWER')
  list(@CurrentTripActor() actor: TripActor) {
    return implement(contract.trips.listMembers).handler(async () => {
      const members = await this.listMembers.execute(actor.tripId);

      return {
        members: members.map((member) => ({
          ...member,
          joinedAt: member.joinedAt.toISOString(),
        })),
      };
    });
  }

  @Implement(contract.trips.removeMember)
  @RequiresTripRole('ADMIN')
  remove(@CurrentTripActor() actor: TripActor) {
    return implement(contract.trips.removeMember).handler(async ({ input }) => {
      await this.run(() => this.removeMember.execute(actor, input.userId));

      return { removed: true as const };
    });
  }

  @Implement(contract.trips.changeMemberRole)
  @RequiresTripRole('ADMIN')
  updateRole(@CurrentTripActor() actor: TripActor) {
    return implement(contract.trips.changeMemberRole).handler(async ({ input }) => {
      await this.run(() => this.changeRole.execute(actor, input.userId, input.role));

      return { updated: true as const };
    });
  }

  @Implement(contract.trips.leaveTrip)
  @RequiresTripRole('VIEWER')
  leave(@CurrentTripActor() actor: TripActor) {
    return implement(contract.trips.leaveTrip).handler(async () => {
      await this.run(() => this.leaveTrip.execute(actor));

      return { left: true as const };
    });
  }

  @Implement(contract.trips.transferOwnership)
  @RequiresTripRole('OWNER')
  transfer(@CurrentTripActor() actor: TripActor) {
    return implement(contract.trips.transferOwnership).handler(async ({ input }) => {
      await this.run(() => this.transferOwnership.execute(actor, input.userId));

      return { transferred: true as const };
    });
  }

  /**
   * Translates policy denials into HTTP.
   *
   * The policy's own reason becomes the message, so a user sees "transfer
   * ownership before leaving this trip" rather than a bare 403.
   */
  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (error instanceof MemberActionDeniedError) {
        throw new ForbiddenException(error.message);
      }
      if (error instanceof MemberNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
