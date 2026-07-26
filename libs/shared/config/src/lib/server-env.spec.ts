import { describe, expect, it } from 'vitest';
import { loadServerEnv } from './server-env';

const minimalEnv = {
  DATABASE_URL: 'postgresql://tripos:tripos@localhost:5432/tripos',
  REDIS_URL: 'redis://localhost:6379',
} satisfies NodeJS.ProcessEnv;

describe('loadServerEnv', () => {
  it('applies defaults when optional variables are absent', () => {
    const env = loadServerEnv(minimalEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('coerces PORT from the string the platform actually provides', () => {
    const env = loadServerEnv({ ...minimalEnv, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('parses CORS_ORIGINS into a trimmed list', () => {
    const env = loadServerEnv({
      ...minimalEnv,
      CORS_ORIGINS: 'http://localhost:4200, https://tripos.app ',
    });

    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200', 'https://tripos.app']);
  });

  it('reports every problem at once rather than only the first', () => {
    let message = '';
    try {
      loadServerEnv({ PORT: 'not-a-port' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('REDIS_URL');
    expect(message).toContain('PORT');
  });

  it('rejects an out-of-range port instead of silently binding elsewhere', () => {
    expect(() => loadServerEnv({ ...minimalEnv, PORT: '70000' })).toThrow(/PORT/);
  });
});
