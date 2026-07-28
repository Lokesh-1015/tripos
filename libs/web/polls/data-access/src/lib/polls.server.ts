import type { PollDto } from '@tripos/shared/contracts';
import { createServerApiClient } from '@tripos/web/shared/data-access';

export async function listPolls(tripId: string): Promise<PollDto[]> {
  const api = await createServerApiClient();
  const { polls } = await api.polls.list({ tripId });

  return polls;
}

export interface CreatePollFields {
  tripId: string;
  subject: PollDto['subject'];
  kind: PollDto['kind'];
  question: string;
  closesAt: string | null;
  allowMemberOptions: boolean;
  options: Array<{
    label: string;
    url?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>;
}

export async function createPoll(fields: CreatePollFields): Promise<PollDto> {
  const api = await createServerApiClient();

  return api.polls.create(fields);
}

export async function castVote(tripId: string, pollId: string, optionId: string): Promise<PollDto> {
  const api = await createServerApiClient();

  return api.polls.vote({ tripId, pollId, optionId });
}

export async function retractVote(
  tripId: string,
  pollId: string,
  optionId: string,
): Promise<PollDto> {
  const api = await createServerApiClient();

  return api.polls.retractVote({ tripId, pollId, optionId });
}

export async function addPollOption(tripId: string, pollId: string, label: string): Promise<void> {
  const api = await createServerApiClient();
  await api.polls.addOption({ tripId, pollId, label });
}

/** `optionId` is only needed to break a tie; otherwise the leader wins. */
export async function closePoll(
  tripId: string,
  pollId: string,
  optionId?: string | null,
): Promise<void> {
  const api = await createServerApiClient();
  await api.polls.close({ tripId, pollId, optionId: optionId ?? null });
}
