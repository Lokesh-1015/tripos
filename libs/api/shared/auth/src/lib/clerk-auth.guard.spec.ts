import { describe, expect, it } from 'vitest';
import { extractBearerToken } from './clerk-auth.guard';

describe('extractBearerToken', () => {
  it('extracts a well-formed bearer token', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('accepts any casing of the scheme', () => {
    expect(extractBearerToken('bearer tok')).toBe('tok');
    expect(extractBearerToken('BEARER tok')).toBe('tok');
  });

  it('rejects other schemes rather than accepting the value', () => {
    // Basic auth credentials must never be treated as a session token.
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
  });

  it('rejects missing, empty, and malformed headers', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
    expect(extractBearerToken('Bearer   ')).toBeNull();
  });
});
