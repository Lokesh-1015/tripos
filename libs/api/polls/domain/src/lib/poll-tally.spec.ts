import { describe, expect, it } from 'vitest';
import {
  AmbiguousPollOutcomeError,
  NoVotesError,
  resolveWinner,
  tallyVotes,
  type RawVote,
} from './poll-tally';

const vote = (optionId: string, userId: string): RawVote => ({ optionId, userId });

describe('tallyVotes', () => {
  it('counts votes per option', () => {
    const tally = tallyVotes(
      ['goa', 'kerala'],
      [vote('goa', 'u1'), vote('goa', 'u2'), vote('kerala', 'u3')],
    );

    expect(tally.perOption).toEqual([
      { optionId: 'goa', votes: 2, isLeading: true },
      { optionId: 'kerala', votes: 1, isLeading: false },
    ]);
    expect(tally.leaders).toEqual(['goa']);
    expect(tally.isTie).toBe(false);
  });

  it('keeps options nobody voted for — a zero is information', () => {
    const tally = tallyVotes(['goa', 'kerala', 'ooty'], [vote('goa', 'u1')]);

    expect(tally.perOption).toHaveLength(3);
    expect(tally.perOption[2]).toEqual({ optionId: 'ooty', votes: 0, isLeading: false });
  });

  it('counts distinct voters, not votes, under approval voting', () => {
    // One person approving three options is one voter, not three.
    const tally = tallyVotes(['a', 'b', 'c'], [vote('a', 'u1'), vote('b', 'u1'), vote('c', 'u1')]);

    expect(tally.voterCount).toBe(1);
    expect(tally.totalVotes).toBe(3);
  });

  it('marks every joint leader as leading', () => {
    const tally = tallyVotes(['goa', 'kerala'], [vote('goa', 'u1'), vote('kerala', 'u2')]);

    expect(tally.perOption.every((option) => option.isLeading)).toBe(true);
    expect(tally.leaders.sort()).toEqual(['goa', 'kerala']);
    expect(tally.isTie).toBe(true);
  });

  it('reports no leaders when nobody has voted', () => {
    const tally = tallyVotes(['goa', 'kerala'], []);

    expect(tally.leaders).toEqual([]);
    expect(tally.isTie).toBe(false);
    expect(tally.perOption.every((option) => !option.isLeading)).toBe(true);
  });

  it('ignores votes for options that no longer exist', () => {
    // A stale client can still hold the id of a deleted option.
    const tally = tallyVotes(['goa'], [vote('goa', 'u1'), vote('deleted-option', 'u2')]);

    expect(tally.totalVotes).toBe(1);
    expect(tally.voterCount).toBe(1);
  });

  it('handles a poll with no options at all', () => {
    const tally = tallyVotes([], []);

    expect(tally.perOption).toEqual([]);
    expect(tally.leaders).toEqual([]);
  });
});

describe('resolveWinner', () => {
  it('returns the sole leader', () => {
    const tally = tallyVotes(['goa', 'kerala'], [vote('goa', 'u1')]);

    expect(resolveWinner(tally)).toBe('goa');
  });

  it('refuses to break a tie by guessing', () => {
    const tally = tallyVotes(['goa', 'kerala'], [vote('goa', 'u1'), vote('kerala', 'u2')]);

    // Silently picking one would record a group decision nobody made.
    expect(() => resolveWinner(tally)).toThrow(AmbiguousPollOutcomeError);
  });

  it('exposes the tied options so a human can choose', () => {
    const tally = tallyVotes(['goa', 'kerala'], [vote('goa', 'u1'), vote('kerala', 'u2')]);

    try {
      resolveWinner(tally);
      throw new Error('expected a tie');
    } catch (error) {
      expect((error as AmbiguousPollOutcomeError).leaders.sort()).toEqual(['goa', 'kerala']);
    }
  });

  it('refuses when nobody voted', () => {
    expect(() => resolveWinner(tallyVotes(['goa'], []))).toThrow(NoVotesError);
  });
});
