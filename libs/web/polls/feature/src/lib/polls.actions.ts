'use server';

import type { PollDto } from '@tripos/shared/contracts';
import {
  addPollOption,
  castVote,
  closePoll,
  createPoll,
  retractVote,
} from '@tripos/web/polls/data-access';
import { revalidatePath } from 'next/cache';

export interface PollActionState {
  error: string | null;
  /** Set when closing hit a tie: the UI asks which option should win. */
  needsTieBreak: boolean;
}

export const initialPollState: PollActionState = { error: null, needsTieBreak: false };

/**
 * A tie is a 409 from the API, not a validation failure — the request was fine,
 * the state is what blocks it. Detecting it here is what lets the UI switch from
 * "close" to "pick the winner" rather than showing a dead-end error.
 */
function isTie(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /tied/i.test(message);
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function voteAction(
  _previous: PollActionState,
  formData: FormData,
): Promise<PollActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const pollId = String(formData.get('pollId') ?? '');
  const optionId = String(formData.get('optionId') ?? '');
  // Present when the user is un-ticking a choice they already made.
  const retract = formData.get('retract') === '1';

  try {
    if (retract) {
      await retractVote(tripId, pollId, optionId);
    } else {
      await castVote(tripId, pollId, optionId);
    }
  } catch (error) {
    return { error: toMessage(error, 'Could not record your vote'), needsTieBreak: false };
  }

  revalidatePath(`/trips/${tripId}`);

  return initialPollState;
}

export async function addOptionAction(
  _previous: PollActionState,
  formData: FormData,
): Promise<PollActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const pollId = String(formData.get('pollId') ?? '');
  const label = String(formData.get('label') ?? '').trim();

  if (label.length === 0) {
    return { error: 'Give the option a name', needsTieBreak: false };
  }

  try {
    await addPollOption(tripId, pollId, label);
  } catch (error) {
    return { error: toMessage(error, 'Could not add that option'), needsTieBreak: false };
  }

  revalidatePath(`/trips/${tripId}`);

  return initialPollState;
}

export async function closePollAction(
  _previous: PollActionState,
  formData: FormData,
): Promise<PollActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const pollId = String(formData.get('pollId') ?? '');
  const optionId = String(formData.get('optionId') ?? '') || null;

  try {
    await closePoll(tripId, pollId, optionId);
  } catch (error) {
    if (isTie(error)) {
      // Not an error the user caused — ask them to decide.
      return { error: null, needsTieBreak: true };
    }
    return { error: toMessage(error, 'Could not close the poll'), needsTieBreak: false };
  }

  revalidatePath(`/trips/${tripId}`);

  return initialPollState;
}

export async function createPollAction(
  _previous: PollActionState,
  formData: FormData,
): Promise<PollActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const subject = String(formData.get('subject') ?? 'GENERAL') as PollDto['subject'];
  const question = String(formData.get('question') ?? '').trim();
  const kind = formData.get('kind') === 'MULTIPLE_CHOICE' ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE';
  const allowMemberOptions = formData.get('allowMemberOptions') === 'on';

  const options =
    subject === 'DATES'
      ? formData
          .getAll('optionStart')
          .map((value, index) => ({
            start: String(value).trim(),
            end: String(formData.getAll('optionEnd')[index] ?? '').trim(),
          }))
          .filter((range) => range.start.length > 0)
          .map((range) => ({
            // A single-day option is a start with no end, not an error.
            label:
              range.end && range.end !== range.start
                ? `${range.start} → ${range.start}`
                : range.start,
            startDate: range.start,
            endDate: range.end || range.start,
          }))
      : formData
          .getAll('option')
          .map((value) => String(value).trim())
          .filter((label) => label.length > 0)
          .map((label) => ({ label }));

  if (question.length === 0) {
    return { error: 'Ask a question', needsTieBreak: false };
  }

  if (options.length < 2) {
    // Mirrors the server rule: one option is an announcement, not a choice.
    return { error: 'Give people at least two options to choose between', needsTieBreak: false };
  }

  try {
    await createPoll({
      tripId,
      subject,
      kind,
      question,
      closesAt: null,
      allowMemberOptions,
      options,
    });
  } catch (error) {
    return { error: toMessage(error, 'Could not create the poll'), needsTieBreak: false };
  }

  revalidatePath(`/trips/${tripId}`);

  return initialPollState;
}
