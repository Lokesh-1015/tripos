import { describe, expect, it } from 'vitest';
import { createApiClient } from './api-client';

/**
 * No network here — these assertions verify that the client is actually derived
 * from the shared contract. If a namespace is renamed or removed in
 * `libs/shared/contracts`, this fails, which is the early-warning signal we want.
 */
describe('createApiClient', () => {
  const api = createApiClient({ baseUrl: 'http://localhost:3000/api' });

  it('exposes the namespaces declared by the contract', () => {
    expect(api.system).toBeDefined();
  });

  it('exposes each contract procedure as a callable', () => {
    expect(typeof api.system.status).toBe('function');
  });
});
