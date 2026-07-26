/**
 * Attributes TripOS keeps about a person, derived from an identity provider.
 *
 * Pure domain: no Nest, no Prisma, no Clerk SDK. Nothing here knows *where* the
 * data came from, which is what makes swapping identity provider a change in one
 * adapter rather than a change to the model (ADR-0003).
 */
export interface UserProfile {
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

/**
 * Raw identity attributes, already normalised out of the provider's payload
 * shape by the adapter that received it.
 */
export interface IdentityAttributes {
  readonly email: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly username: string | null;
  readonly avatarUrl: string | null;
}

export class InvalidIdentityError extends Error {
  constructor(reason: string) {
    super(`Cannot build a user profile: ${reason}`);
    this.name = 'InvalidIdentityError';
  }
}

/**
 * Picks the best available display name.
 *
 * This matters more than it looks: the display name is what the rest of the group
 * sees next to expenses and messages, so an empty or robotic one is a visible
 * product flaw. Order of preference is full name, then either name alone, then
 * username, and only as a last resort the email local-part.
 *
 * The email local-part is deliberately last — showing `j.smith92` to a group of
 * friends is worse than any real name, but better than a blank.
 */
export function deriveDisplayName(attributes: IdentityAttributes): string {
  const first = attributes.firstName?.trim() ?? '';
  const last = attributes.lastName?.trim() ?? '';
  const fullName = [first, last].filter((part) => part.length > 0).join(' ');

  if (fullName.length > 0) {
    return fullName;
  }

  const username = attributes.username?.trim() ?? '';
  if (username.length > 0) {
    return username;
  }

  const email = attributes.email?.trim() ?? '';
  const localPart = email.split('@')[0] ?? '';
  if (localPart.length > 0) {
    return localPart;
  }

  throw new InvalidIdentityError('no name, username, or email was provided');
}

/**
 * Builds the profile TripOS stores. Throws rather than inventing data — a user
 * without an email cannot be invited to a trip, so silently accepting one would
 * push the failure somewhere far less obvious.
 */
export function buildUserProfile(attributes: IdentityAttributes): UserProfile {
  const email = attributes.email?.trim().toLowerCase() ?? '';

  if (email.length === 0) {
    throw new InvalidIdentityError('an email address is required');
  }

  return {
    email,
    displayName: deriveDisplayName(attributes),
    avatarUrl: attributes.avatarUrl?.trim() || null,
  };
}
