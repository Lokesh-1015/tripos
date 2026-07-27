import type { TripSummaryDto } from '@tripos/shared/contracts';
import { Badge, Card } from '@tripos/shared/ui';
import Link from 'next/link';

/**
 * Renders the stored date-only strings directly.
 *
 * Passing them through `new Date()` would shift them across a timezone boundary
 * — a trip starting on the 3rd would show as the 2nd for anyone west of UTC
 * (CLAUDE.md §9).
 */
function formatDateRange(trip: TripSummaryDto): string | null {
  if (!trip.startDate) return null;

  const pretty = (iso: string) => {
    const [year, month, day] = iso.split('-');
    const monthName = MONTHS[Number(month) - 1] ?? '';
    return `${Number(day)} ${monthName} ${year}`;
  };

  if (!trip.endDate || trip.endDate === trip.startDate) {
    return pretty(trip.startDate);
  }

  return `${pretty(trip.startDate)} → ${pretty(trip.endDate)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ROLE_LABEL: Record<TripSummaryDto['myRole'], string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

const STATUS_TONE = {
  DRAFT: 'neutral',
  PLANNING: 'brand',
  ACTIVE: 'positive',
  COMPLETED: 'neutral',
  ARCHIVED: 'neutral',
} as const;

export function TripList({ trips }: { trips: TripSummaryDto[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {trips.map((trip) => {
        const dates = formatDateRange(trip);

        return (
          <li key={trip.id}>
            <Link href={`/trips/${trip.id}`} className="block focus-visible:outline-none">
              <Card interactive className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="truncate font-semibold">{trip.name}</h3>
                  <Badge tone={STATUS_TONE[trip.status]}>{trip.status.toLowerCase()}</Badge>
                </div>

                <p className="text-text-muted mt-1 text-sm">
                  {trip.destination ?? 'Destination to be decided'}
                </p>

                <div className="text-text-subtle mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {dates ? <span>{dates}</span> : <span>Dates not set</span>}
                  <span aria-hidden>·</span>
                  <span>
                    {trip.memberCount} {trip.memberCount === 1 ? 'member' : 'members'}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{trip.baseCurrency}</span>
                  <span aria-hidden>·</span>
                  <span>{ROLE_LABEL[trip.myRole]}</span>
                </div>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
