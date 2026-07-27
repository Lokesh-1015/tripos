import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { AUTH_CONTEXT_KEY } from '@tripos/api/shared/auth';
import type { TripActor, TripRole } from '@tripos/api/shared/authz';
import { beforeEach, describe, expect, it } from 'vitest';
import { REQUIRES_TRIP_ROLE_KEY } from './requires-trip-role.decorator';
import { resolveTripId, TripAccessGuard } from './trip-access.guard';
import { TRIP_ACTOR_KEY } from './trip-actor';
import type { TripMembershipReader } from './trip-membership.reader';

class FakeMembershipReader implements TripMembershipReader {
  constructor(private readonly actors: Record<string, TripActor | undefined> = {}) {}
  lookups = 0;

  async findActor(tripId: string, userId: string): Promise<TripActor | null> {
    this.lookups += 1;
    return this.actors[`${tripId}:${userId}`] ?? null;
  }
}

/** Minimal Reflector stand-in — only getAllAndOverride is used. */
const reflectorReturning = (role: TripRole | undefined) =>
  ({ getAllAndOverride: () => role }) as never;

const contextFor = (request: object): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

const actor = (role: TripRole, overrides: Partial<TripActor> = {}): TripActor => ({
  userId: 'user_1',
  tripId: 'trip_1',
  role,
  status: 'ACTIVE',
  ...overrides,
});

describe('resolveTripId', () => {
  it('prefers route params, the least forgeable source', () => {
    expect(resolveTripId({ params: { tripId: 'from-param' }, body: { tripId: 'from-body' } })).toBe(
      'from-param',
    );
  });

  it('accepts :id as well as :tripId', () => {
    expect(resolveTripId({ params: { id: 'trip_9' } })).toBe('trip_9');
  });

  it('falls back to query and body', () => {
    expect(resolveTripId({ query: { tripId: 'q' } })).toBe('q');
    expect(resolveTripId({ body: { tripId: 'b' } })).toBe('b');
  });

  it('ignores non-string and empty values', () => {
    expect(resolveTripId({ body: { tripId: 42 } })).toBeNull();
    expect(resolveTripId({ params: { tripId: '' } })).toBeNull();
    expect(resolveTripId({})).toBeNull();
  });
});

describe('TripAccessGuard', () => {
  let reader: FakeMembershipReader;

  beforeEach(() => {
    reader = new FakeMembershipReader({ 'trip_1:user_1': actor('MEMBER') });
  });

  interface TestRequest {
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    [AUTH_CONTEXT_KEY]?: { userId: string; clerkUserId: string };
    [TRIP_ACTOR_KEY]?: TripActor;
  }

  const authedRequest = (extra: Partial<TestRequest> = {}): TestRequest => ({
    params: { tripId: 'trip_1' },
    [AUTH_CONTEXT_KEY]: { userId: 'user_1', clerkUserId: 'clerk_1' },
    ...extra,
  });

  it('FAILS CLOSED when the route declares no required role', async () => {
    const guard = new TripAccessGuard(reflectorReturning(undefined), reader);

    await expect(guard.canActivate(contextFor(authedRequest()))).rejects.toThrow(
      ForbiddenException,
    );
    // It must not even look up membership — the route is misconfigured.
    expect(reader.lookups).toBe(0);
  });

  it('rejects an unauthenticated caller', async () => {
    const guard = new TripAccessGuard(reflectorReturning('MEMBER'), reader);
    const request = { params: { tripId: 'trip_1' } };

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when no trip id is present', async () => {
    const guard = new TripAccessGuard(reflectorReturning('MEMBER'), reader);
    const request = { [AUTH_CONTEXT_KEY]: { userId: 'user_1', clerkUserId: 'c' } };

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(ForbiddenException);
  });

  it('denies a non-member without revealing whether the trip exists', async () => {
    const guard = new TripAccessGuard(reflectorReturning('MEMBER'), new FakeMembershipReader());

    // Forbidden, never 404 — a difference would let anyone enumerate trip ids.
    await expect(guard.canActivate(contextFor(authedRequest()))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('denies a REMOVED member even though a row exists', async () => {
    const removed = new FakeMembershipReader({
      'trip_1:user_1': actor('ADMIN', { status: 'REMOVED' }),
    });
    const guard = new TripAccessGuard(reflectorReturning('MEMBER'), removed);

    await expect(guard.canActivate(contextFor(authedRequest()))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('denies when the role is below what the route requires', async () => {
    const guard = new TripAccessGuard(reflectorReturning('ADMIN'), reader);

    await expect(guard.canActivate(contextFor(authedRequest()))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows a sufficient role and attaches the actor for handlers to reuse', async () => {
    const guard = new TripAccessGuard(reflectorReturning('MEMBER'), reader);
    const request = authedRequest();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request[TRIP_ACTOR_KEY]).toMatchObject({ role: 'MEMBER', tripId: 'trip_1' });
  });

  it('allows a role above the requirement', async () => {
    const owner = new FakeMembershipReader({ 'trip_1:user_1': actor('OWNER') });
    const guard = new TripAccessGuard(reflectorReturning('ADMIN'), owner);

    await expect(guard.canActivate(contextFor(authedRequest()))).resolves.toBe(true);
  });

  it('never trusts a client-supplied role in the body', async () => {
    const guard = new TripAccessGuard(reflectorReturning('OWNER'), reader);
    const request = authedRequest({ body: { role: 'OWNER' } });

    // Membership says MEMBER; the body claiming OWNER must change nothing.
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(ForbiddenException);
  });

  it('resolves membership exactly once per request', async () => {
    const guard = new TripAccessGuard(reflectorReturning('MEMBER'), reader);

    await guard.canActivate(contextFor(authedRequest()));

    expect(reader.lookups).toBe(1);
  });

  it('keys the lookup on the authenticated user, not a body-supplied one', async () => {
    const guard = new TripAccessGuard(reflectorReturning('MEMBER'), reader);
    const request = authedRequest({ body: { userId: 'someone_else' } });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    // Resolved for user_1 (authenticated), not "someone_else".
    expect(request[TRIP_ACTOR_KEY]).toMatchObject({ userId: 'user_1' });
  });
});

describe('REQUIRES_TRIP_ROLE_KEY', () => {
  it('is a stable metadata key', () => {
    expect(REQUIRES_TRIP_ROLE_KEY).toBe('triposRequiresTripRole');
  });
});
