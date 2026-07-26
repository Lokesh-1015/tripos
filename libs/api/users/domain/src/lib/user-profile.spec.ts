import { describe, expect, it } from 'vitest';
import { buildUserProfile, deriveDisplayName, InvalidIdentityError } from './user-profile';

const base = {
  email: 'ada@example.com',
  firstName: null,
  lastName: null,
  username: null,
  avatarUrl: null,
};

describe('deriveDisplayName', () => {
  it('prefers a full name', () => {
    expect(deriveDisplayName({ ...base, firstName: 'Ada', lastName: 'Lovelace' })).toBe(
      'Ada Lovelace',
    );
  });

  it('falls back to whichever single name exists', () => {
    expect(deriveDisplayName({ ...base, firstName: 'Ada' })).toBe('Ada');
    expect(deriveDisplayName({ ...base, lastName: 'Lovelace' })).toBe('Lovelace');
  });

  it('prefers a username over the email local-part', () => {
    expect(deriveDisplayName({ ...base, username: 'ada' })).toBe('ada');
  });

  it('uses the email local-part only as a last resort', () => {
    expect(deriveDisplayName(base)).toBe('ada');
  });

  it('ignores whitespace-only names rather than rendering a blank', () => {
    expect(deriveDisplayName({ ...base, firstName: '   ', username: 'ada' })).toBe('ada');
  });

  it('throws when there is nothing usable at all', () => {
    expect(() => deriveDisplayName({ ...base, email: null })).toThrow(InvalidIdentityError);
  });
});

describe('buildUserProfile', () => {
  it('normalises the email to lowercase', () => {
    expect(buildUserProfile({ ...base, email: '  Ada@Example.COM ' }).email).toBe(
      'ada@example.com',
    );
  });

  it('requires an email', () => {
    expect(() => buildUserProfile({ ...base, email: null })).toThrow(/email address is required/);
  });

  it('treats a blank avatar as absent rather than storing an empty string', () => {
    expect(buildUserProfile({ ...base, avatarUrl: '   ' }).avatarUrl).toBeNull();
  });

  it('keeps a real avatar URL', () => {
    expect(buildUserProfile({ ...base, avatarUrl: 'https://img.example/a.png' }).avatarUrl).toBe(
      'https://img.example/a.png',
    );
  });
});
