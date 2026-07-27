import { describe, expect, it } from 'vitest';
import { generateInviteToken, hashInviteToken, inviteTokenMatches } from './invite-token';
import { checkInviteUsable, defaultInviteExpiry, type InviteState } from './invite-validity';

const now = new Date('2026-07-27T00:00:00.000Z');
const hour = 60 * 60 * 1000;

const invite = (overrides: Partial<InviteState> = {}): InviteState => ({
  expiresAt: new Date(now.getTime() + 24 * hour),
  revokedAt: null,
  maxUses: null,
  useCount: 0,
  ...overrides,
});

describe('invite tokens', () => {
  it('generates URL-safe tokens with no padding or escaping needed', () => {
    const token = generateInviteToken();

    // base64url only — these get pasted into WhatsApp messages.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates a distinct token every time', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateInviteToken()));

    expect(tokens.size).toBe(200);
  });

  it('produces enough entropy to be unguessable', () => {
    // 32 random bytes -> 43 base64url chars.
    expect(generateInviteToken().length).toBeGreaterThanOrEqual(43);
  });

  it('hashes deterministically', () => {
    expect(hashInviteToken('abc')).toBe(hashInviteToken('abc'));
    expect(hashInviteToken('abc')).not.toBe(hashInviteToken('abd'));
  });

  it('never stores anything resembling the raw token', () => {
    const token = generateInviteToken();

    expect(hashInviteToken(token)).not.toContain(token);
  });

  it('matches a correct token against its stored hash', () => {
    const token = generateInviteToken();

    expect(inviteTokenMatches(token, hashInviteToken(token))).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(inviteTokenMatches(generateInviteToken(), hashInviteToken(generateInviteToken()))).toBe(
      false,
    );
  });

  it('rejects a malformed stored hash without throwing', () => {
    // A truncated or corrupt column must fail closed, not crash the request.
    expect(inviteTokenMatches('anything', 'not-a-hash')).toBe(false);
    expect(inviteTokenMatches('anything', '')).toBe(false);
  });
});

describe('checkInviteUsable', () => {
  it('accepts a fresh invite', () => {
    expect(checkInviteUsable(invite(), now).usable).toBe(true);
  });

  it('rejects a revoked invite', () => {
    const result = checkInviteUsable(invite({ revokedAt: new Date() }), now);

    expect(result.usable).toBe(false);
    if (!result.usable) expect(result.rejection).toBe('REVOKED');
  });

  it('reports revocation ahead of expiry, which is the more useful message', () => {
    const result = checkInviteUsable(
      invite({ revokedAt: new Date(), expiresAt: new Date(now.getTime() - hour) }),
      now,
    );

    if (!result.usable) expect(result.rejection).toBe('REVOKED');
  });

  it('rejects an expired invite', () => {
    const result = checkInviteUsable(invite({ expiresAt: new Date(now.getTime() - 1) }), now);

    expect(result.usable).toBe(false);
    if (!result.usable) expect(result.rejection).toBe('EXPIRED');
  });

  it('treats the exact expiry instant as expired', () => {
    expect(checkInviteUsable(invite({ expiresAt: now }), now).usable).toBe(false);
  });

  it('rejects an exhausted invite', () => {
    const result = checkInviteUsable(invite({ maxUses: 3, useCount: 3 }), now);

    expect(result.usable).toBe(false);
    if (!result.usable) expect(result.rejection).toBe('EXHAUSTED');
  });

  it('allows a limited invite that still has uses left', () => {
    expect(checkInviteUsable(invite({ maxUses: 3, useCount: 2 }), now).usable).toBe(true);
  });

  it('treats a null maxUses as unlimited', () => {
    expect(checkInviteUsable(invite({ maxUses: null, useCount: 999 }), now).usable).toBe(true);
  });
});

describe('defaultInviteExpiry', () => {
  it('is a fortnight out — long enough to plan, short enough to matter', () => {
    const expiry = defaultInviteExpiry(now);

    expect(expiry.getTime() - now.getTime()).toBe(14 * 24 * hour);
  });
});
