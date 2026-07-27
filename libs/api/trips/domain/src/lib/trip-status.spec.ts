import { describe, expect, it } from 'vitest';
import {
  acceptsNewContent,
  assertTransition,
  canTransitionTo,
  InvalidTripTransitionError,
  TRIP_STATUSES,
} from './trip-status';

describe('canTransitionTo', () => {
  it('treats a no-op transition as valid, because clients retry', () => {
    for (const status of TRIP_STATUSES) {
      expect(canTransitionTo(status, status)).toBe(true);
    }
  });

  it('walks the normal lifecycle', () => {
    expect(canTransitionTo('DRAFT', 'PLANNING')).toBe(true);
    expect(canTransitionTo('PLANNING', 'ACTIVE')).toBe(true);
    expect(canTransitionTo('ACTIVE', 'COMPLETED')).toBe(true);
    expect(canTransitionTo('COMPLETED', 'ARCHIVED')).toBe(true);
  });

  it('allows returning to planning mid-trip, because plans change', () => {
    expect(canTransitionTo('ACTIVE', 'PLANNING')).toBe(true);
  });

  it('treats ARCHIVED as terminal', () => {
    for (const status of TRIP_STATUSES) {
      if (status === 'ARCHIVED') continue;
      expect(canTransitionTo('ARCHIVED', status)).toBe(false);
    }
  });

  it('refuses to skip backwards from COMPLETED into an active state', () => {
    expect(canTransitionTo('COMPLETED', 'ACTIVE')).toBe(false);
    expect(canTransitionTo('COMPLETED', 'PLANNING')).toBe(false);
  });

  it('refuses to start a draft trip without planning it', () => {
    expect(canTransitionTo('DRAFT', 'ACTIVE')).toBe(false);
    expect(canTransitionTo('DRAFT', 'COMPLETED')).toBe(false);
  });

  it('lets any non-terminal state be archived', () => {
    expect(canTransitionTo('DRAFT', 'ARCHIVED')).toBe(true);
    expect(canTransitionTo('PLANNING', 'ARCHIVED')).toBe(true);
    expect(canTransitionTo('ACTIVE', 'ARCHIVED')).toBe(true);
  });
});

describe('assertTransition', () => {
  it('throws a named error on an illegal move', () => {
    expect(() => assertTransition('ARCHIVED', 'ACTIVE')).toThrow(InvalidTripTransitionError);
    expect(() => assertTransition('ARCHIVED', 'ACTIVE')).toThrow(
      /cannot move from ARCHIVED to ACTIVE/,
    );
  });

  it('is silent on a legal move', () => {
    expect(() => assertTransition('PLANNING', 'ACTIVE')).not.toThrow();
  });
});

describe('acceptsNewContent', () => {
  it('permits content while a trip is live or being planned', () => {
    expect(acceptsNewContent('DRAFT')).toBe(true);
    expect(acceptsNewContent('PLANNING')).toBe(true);
    expect(acceptsNewContent('ACTIVE')).toBe(true);
  });

  it('closes finished trips to new content', () => {
    expect(acceptsNewContent('COMPLETED')).toBe(false);
    expect(acceptsNewContent('ARCHIVED')).toBe(false);
  });
});
