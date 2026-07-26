import { describe, expect, it } from 'vitest';
import { systemStatusOutputSchema } from './system.contract';

/**
 * Contract schemas are worth testing directly: they are the single source of
 * truth for both sides of the wire, so a mistake here is a mistake everywhere.
 */
describe('systemStatusOutputSchema', () => {
  const valid = {
    status: 'ok',
    environment: 'development',
    uptimeSeconds: 12,
    serverTime: '2026-07-26T12:00:00.000Z',
  };

  it('accepts a well-formed status payload', () => {
    expect(systemStatusOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an unknown environment rather than passing it through', () => {
    expect(() => systemStatusOutputSchema.parse({ ...valid, environment: 'staging' })).toThrow();
  });

  it('rejects a non-ISO serverTime', () => {
    expect(() => systemStatusOutputSchema.parse({ ...valid, serverTime: '26/07/2026' })).toThrow();
  });

  it('rejects fractional or negative uptime', () => {
    expect(() => systemStatusOutputSchema.parse({ ...valid, uptimeSeconds: 1.5 })).toThrow();
    expect(() => systemStatusOutputSchema.parse({ ...valid, uptimeSeconds: -1 })).toThrow();
  });
});
