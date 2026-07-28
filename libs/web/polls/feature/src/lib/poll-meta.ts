import type { PollDto } from '@tripos/shared/contracts';

/**
 * Presentation metadata for each poll subject.
 *
 * This is the whole "five features, one primitive" idea made visible: the five
 * voting features PRD §9 asks for are rows in this table, not five codebases.
 * Adding "which flight?" later means one more row.
 */
export interface SubjectMeta {
  readonly icon: string;
  readonly label: string;
  /** Wording for the create form, so each poll type reads naturally. */
  readonly questionPlaceholder: string;
  readonly optionPlaceholder: string;
  /** Date polls collect a range per option instead of a free-text label. */
  readonly usesDateRange: boolean;
}

export const SUBJECT_META: Record<PollDto['subject'], SubjectMeta> = {
  DESTINATION: {
    icon: '📍',
    label: 'Destination',
    questionPlaceholder: 'Where should we go?',
    optionPlaceholder: 'Goa',
    usesDateRange: false,
  },
  DATES: {
    icon: '📅',
    label: 'Dates',
    questionPlaceholder: 'Which dates work for everyone?',
    optionPlaceholder: '',
    usesDateRange: true,
  },
  ACTIVITY: {
    icon: '🎟️',
    label: 'Activity',
    questionPlaceholder: 'What should we do?',
    optionPlaceholder: 'Scuba diving',
    usesDateRange: false,
  },
  RESTAURANT: {
    icon: '🍽️',
    label: 'Food',
    questionPlaceholder: 'Where should we eat?',
    optionPlaceholder: "Martin's Corner",
    usesDateRange: false,
  },
  ACCOMMODATION: {
    icon: '🏨',
    label: 'Stay',
    questionPlaceholder: 'Where should we stay?',
    optionPlaceholder: 'Beach House, Anjuna',
    usesDateRange: false,
  },
  GENERAL: {
    icon: '💬',
    label: 'General',
    questionPlaceholder: 'What should we decide?',
    optionPlaceholder: 'Option',
    usesDateRange: false,
  },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a stored date-only string.
 *
 * Never routed through `new Date()`: that would shift the day for anyone west of
 * UTC, so a trip starting on the 3rd would render as the 2nd (CLAUDE.md §9).
 */
export function formatDateOnly(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''} ${year}`;
}

/** Human label for a date-range option, falling back to its own label. */
export function optionLabel(option: PollDto['options'][number]): string {
  if (!option.startDate) return option.label;

  const start = formatDateOnly(option.startDate);
  if (!option.endDate || option.endDate === option.startDate) return start;

  return `${start} → ${formatDateOnly(option.endDate)}`;
}

/** "in 3 days" / "in 4 hours" / "today" — relative, because a deadline is about urgency. */
export function describeDeadline(closesAt: string, now: Date = new Date()): string {
  const remainingMs = new Date(closesAt).getTime() - now.getTime();

  if (remainingMs <= 0) return 'Voting closed';

  const hours = Math.round(remainingMs / 3_600_000);
  if (hours < 1) return 'Closes in under an hour';
  if (hours < 24) return `Closes in ${hours} hour${hours === 1 ? '' : 's'}`;

  const days = Math.round(hours / 24);
  return `Closes in ${days} day${days === 1 ? '' : 's'}`;
}

/** Percentage of voters backing an option. Guards the zero-voter divide. */
export function sharePercent(votes: number, voterCount: number): number {
  if (voterCount === 0) return 0;

  return Math.round((votes / voterCount) * 100);
}
