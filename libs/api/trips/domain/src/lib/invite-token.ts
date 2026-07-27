import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Invite tokens.
 *
 * The raw token is shown to the inviter ONCE and never stored — only its SHA-256
 * hash goes in the database. A leaked backup must not hand out access to
 * people's trips, exactly as with passwords.
 *
 * SHA-256 rather than bcrypt/argon2 is deliberate and worth stating: these are
 * 256 bits of cryptographic randomness, not user-chosen secrets, so there is no
 * dictionary to attack and no benefit to a slow KDF. What matters is that the
 * stored value is not usable as a token, and that comparison is constant-time.
 */
const TOKEN_BYTES = 32;

export function generateInviteToken(): string {
  // base64url: safe in a URL without escaping, which matters because this is
  // pasted into WhatsApp messages.
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of a presented token against a stored hash.
 *
 * A plain `===` on hashes leaks timing information about how many leading
 * characters matched. The window is small, but this is a free mitigation on an
 * authentication-adjacent path.
 */
export function inviteTokenMatches(presentedToken: string, storedHash: string): boolean {
  const presented = Buffer.from(hashInviteToken(presentedToken), 'hex');
  const stored = Buffer.from(storedHash, 'hex');

  if (presented.length !== stored.length) {
    return false;
  }

  return timingSafeEqual(presented, stored);
}
