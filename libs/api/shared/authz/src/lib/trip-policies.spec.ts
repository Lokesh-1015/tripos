import { describe, expect, it } from 'vitest';
import {
  canChangeMemberRole,
  canContributeContent,
  canDeleteTrip,
  canEditTrip,
  canInviteMembers,
  canLeaveTrip,
  canRemoveMember,
  canTransferOwnership,
  canViewTrip,
} from './trip-policies';
import { hasAtLeastRole, outranks, TRIP_ROLES, type TripActor, type TripRole } from './trip-roles';

const actor = (role: TripRole, overrides: Partial<TripActor> = {}): TripActor => ({
  userId: `user_${role}`,
  tripId: 'trip_1',
  role,
  status: 'ACTIVE',
  ...overrides,
});

const owner = actor('OWNER');
const admin = actor('ADMIN');
const member = actor('MEMBER');
const viewer = actor('VIEWER');

describe('role ranking', () => {
  it('orders roles by authority', () => {
    expect(hasAtLeastRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasAtLeastRole('ADMIN', 'OWNER')).toBe(false);
    expect(hasAtLeastRole('MEMBER', 'MEMBER')).toBe(true);
    expect(outranks('ADMIN', 'ADMIN')).toBe(false);
    expect(outranks('ADMIN', 'MEMBER')).toBe(true);
  });
});

describe('removed members', () => {
  it.each(TRIP_ROLES)('denies every action to a removed %s', (role) => {
    const removed = actor(role, { status: 'REMOVED' });

    // A removed member is not a low-privilege member — they have no access.
    expect(canViewTrip(removed).allowed).toBe(false);
    expect(canEditTrip(removed).allowed).toBe(false);
    expect(canContributeContent(removed).allowed).toBe(false);
    expect(canInviteMembers(removed).allowed).toBe(false);
    expect(canLeaveTrip(removed).allowed).toBe(false);
  });
});

describe('trip lifecycle', () => {
  it('lets any active member view', () => {
    expect(canViewTrip(viewer).allowed).toBe(true);
  });

  it('restricts editing to admins and above', () => {
    expect(canEditTrip(owner).allowed).toBe(true);
    expect(canEditTrip(admin).allowed).toBe(true);
    expect(canEditTrip(member).allowed).toBe(false);
    expect(canEditTrip(viewer).allowed).toBe(false);
  });

  it('restricts deletion to the owner alone', () => {
    expect(canDeleteTrip(owner).allowed).toBe(true);
    expect(canDeleteTrip(admin).allowed).toBe(false);
  });
});

describe('content contribution', () => {
  it('permits members and above but never viewers', () => {
    expect(canContributeContent(member).allowed).toBe(true);
    expect(canContributeContent(admin).allowed).toBe(true);
    expect(canContributeContent(viewer).allowed).toBe(false);
  });
});

describe('canRemoveMember', () => {
  it('never allows removing the owner', () => {
    const result = canRemoveMember(admin, owner);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/owner cannot be removed/i);
  });

  it('refuses to remove a peer, so two admins cannot fight', () => {
    const otherAdmin = actor('ADMIN', { userId: 'user_ADMIN_2' });
    expect(canRemoveMember(admin, otherAdmin).allowed).toBe(false);
  });

  it('allows an admin to remove a member', () => {
    expect(canRemoveMember(admin, member).allowed).toBe(true);
  });

  it('redirects self-removal to leave-trip', () => {
    const result = canRemoveMember(admin, admin);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/leave-trip/i);
  });

  it('denies members and viewers outright', () => {
    expect(canRemoveMember(member, viewer).allowed).toBe(false);
    expect(canRemoveMember(viewer, member).allowed).toBe(false);
  });
});

describe('canChangeMemberRole — privilege escalation', () => {
  it('never assigns OWNER as a role', () => {
    const result = canChangeMemberRole(owner, member, 'OWNER');
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/transferred explicitly/i);
  });

  it('stops an admin promoting anyone to admin — no granting your own level', () => {
    expect(canChangeMemberRole(admin, member, 'ADMIN').allowed).toBe(false);
  });

  it('lets an owner promote a member to admin', () => {
    expect(canChangeMemberRole(owner, member, 'ADMIN').allowed).toBe(true);
  });

  it('stops an admin editing a peer', () => {
    const otherAdmin = actor('ADMIN', { userId: 'user_ADMIN_2' });
    expect(canChangeMemberRole(admin, otherAdmin, 'MEMBER').allowed).toBe(false);
  });

  it('stops self-promotion', () => {
    expect(canChangeMemberRole(admin, admin, 'ADMIN').allowed).toBe(false);
  });

  it('allows an admin to demote a member to viewer', () => {
    expect(canChangeMemberRole(admin, member, 'VIEWER').allowed).toBe(true);
  });
});

describe('canLeaveTrip', () => {
  it('blocks the owner from orphaning the trip', () => {
    const result = canLeaveTrip(owner);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/transfer ownership/i);
  });

  it('lets everyone else leave', () => {
    expect(canLeaveTrip(admin).allowed).toBe(true);
    expect(canLeaveTrip(member).allowed).toBe(true);
    expect(canLeaveTrip(viewer).allowed).toBe(true);
  });
});

describe('canTransferOwnership', () => {
  it('is owner-only', () => {
    expect(canTransferOwnership(admin, member).allowed).toBe(false);
    expect(canTransferOwnership(owner, member).allowed).toBe(true);
  });

  it('refuses transfer to a removed member', () => {
    const removed = actor('MEMBER', { userId: 'gone', status: 'REMOVED' });
    expect(canTransferOwnership(owner, removed).allowed).toBe(false);
  });

  it('refuses a no-op transfer to yourself', () => {
    expect(canTransferOwnership(owner, owner).allowed).toBe(false);
  });
});
