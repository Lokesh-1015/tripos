import { hasAtLeastRole, outranks, type TripActor, type TripRole } from './trip-roles';

/**
 * The result of a permission check.
 *
 * Deliberately not a bare boolean: the reason is what turns a 403 into a message
 * a user can act on ("the owner must transfer ownership before leaving" rather
 * than "Forbidden"), and it lets tests assert *why* something was denied rather
 * than merely that it was.
 */
export type PolicyResult =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

const ALLOW: PolicyResult = { allowed: true };
const deny = (reason: string): PolicyResult => ({ allowed: false, reason });

/**
 * Every policy below starts here. A removed member is not a low-privilege
 * member — they have no access at all, and forgetting that check is the classic
 * way a "removed" user keeps reading a group's data.
 */
function requireActiveMembership(actor: TripActor): PolicyResult {
  return actor.status === 'ACTIVE' ? ALLOW : deny('You are no longer a member of this trip');
}

function requireRole(actor: TripActor, required: TripRole, action: string): PolicyResult {
  const active = requireActiveMembership(actor);
  if (!active.allowed) return active;

  return hasAtLeastRole(actor.role, required)
    ? ALLOW
    : deny(`Only ${required} or above can ${action}`);
}

// --- Reading -------------------------------------------------------------

export function canViewTrip(actor: TripActor): PolicyResult {
  return requireActiveMembership(actor);
}

// --- Trip lifecycle ------------------------------------------------------

export function canEditTrip(actor: TripActor): PolicyResult {
  return requireRole(actor, 'ADMIN', 'edit trip details');
}

export function canArchiveTrip(actor: TripActor): PolicyResult {
  return requireRole(actor, 'ADMIN', 'archive a trip');
}

export function canDeleteTrip(actor: TripActor): PolicyResult {
  return requireRole(actor, 'OWNER', 'delete a trip');
}

// --- Membership ----------------------------------------------------------

export function canInviteMembers(actor: TripActor): PolicyResult {
  return requireRole(actor, 'ADMIN', 'invite members');
}

/**
 * Removing a member.
 *
 * The rules that matter: nobody removes the owner (the trip would be orphaned),
 * and an admin cannot remove a peer or a superior — otherwise two admins can
 * fight, and whoever clicks first wins. Removing yourself is `canLeaveTrip`.
 */
export function canRemoveMember(actor: TripActor, target: TripActor): PolicyResult {
  const permitted = requireRole(actor, 'ADMIN', 'remove members');
  if (!permitted.allowed) return permitted;

  if (target.userId === actor.userId) {
    return deny('Use leave-trip to remove yourself');
  }

  if (target.role === 'OWNER') {
    return deny('The trip owner cannot be removed; ownership must be transferred first');
  }

  return outranks(actor.role, target.role)
    ? ALLOW
    : deny('You cannot remove a member with the same or higher role');
}

/**
 * Changing someone's role.
 *
 * An actor can never grant a role at or above their own — that is privilege
 * escalation, and it is the single most valuable bug an attacker could find in
 * a permission system. OWNER is granted only by transfer, never by assignment.
 */
export function canChangeMemberRole(
  actor: TripActor,
  target: TripActor,
  newRole: TripRole,
): PolicyResult {
  const permitted = requireRole(actor, 'ADMIN', 'change member roles');
  if (!permitted.allowed) return permitted;

  if (newRole === 'OWNER') {
    return deny('Ownership is transferred explicitly, not assigned as a role');
  }

  if (target.role === 'OWNER') {
    return deny("The owner's role cannot be changed; transfer ownership instead");
  }

  if (target.userId === actor.userId) {
    return deny('You cannot change your own role');
  }

  if (!outranks(actor.role, target.role)) {
    return deny('You cannot change the role of a member at or above your own');
  }

  // STRICTLY outranks: granting your own level is escalation too. An admin who
  // could appoint other admins would create peers that `canRemoveMember`
  // forbids anyone but the owner from removing — an unremovable, unbounded
  // admin set. Co-management is the owner's decision alone.
  if (!outranks(actor.role, newRole)) {
    return deny('You cannot grant a role at or above your own');
  }

  return ALLOW;
}

/**
 * Leaving a trip.
 *
 * An owner may not simply leave: doing so orphans the trip, with nobody able to
 * manage members or settle it (docs/prd-review.md, ADR-0006). They must transfer
 * ownership first.
 */
export function canLeaveTrip(actor: TripActor): PolicyResult {
  const active = requireActiveMembership(actor);
  if (!active.allowed) return active;

  return actor.role === 'OWNER'
    ? deny('Transfer ownership to another member before leaving this trip')
    : ALLOW;
}

export function canTransferOwnership(actor: TripActor, target: TripActor): PolicyResult {
  const permitted = requireRole(actor, 'OWNER', 'transfer ownership');
  if (!permitted.allowed) return permitted;

  if (target.userId === actor.userId) {
    return deny('You already own this trip');
  }

  return target.status === 'ACTIVE'
    ? ALLOW
    : deny('Ownership can only be transferred to an active member');
}

// --- Content -------------------------------------------------------------

/**
 * Writing trip content — itinerary items, expenses, messages.
 *
 * VIEWER is the meaningful boundary here: they can read everything and change
 * nothing, which is the point of the role.
 */
export function canContributeContent(actor: TripActor): PolicyResult {
  return requireRole(actor, 'MEMBER', 'add or edit trip content');
}
