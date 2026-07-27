export { POLL_SUBJECTS, checkCanVote, isAcceptingVotes } from './lib/poll-lifecycle';
export type {
  PollKind,
  PollState,
  PollStatus,
  PollSubject,
  VoteCheck,
  VoteRejection,
} from './lib/poll-lifecycle';

export {
  AmbiguousPollOutcomeError,
  NoVotesError,
  resolveWinner,
  tallyVotes,
} from './lib/poll-tally';
export type { OptionTally, RawVote, Tally } from './lib/poll-tally';
