import type { TripSummaryDto } from '@tripos/shared/contracts';
import Link from 'next/link';

function formatDates(trip: TripSummaryDto): string | null {
  if (!trip.startDate) return null;

  // Dates are date-only strings; rendering them as-is avoids the timezone shift
  // that `new Date('2026-08-03').toLocaleDateString()` would introduce
  // (CLAUDE.md §9).
  return trip.endDate && trip.endDate !== trip.startDate
    ? `${trip.startDate} → ${trip.endDate}`
    : trip.startDate;
}

const ROLE_LABEL: Record<TripSummaryDto['myRole'], string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

export function TripList({ trips }: { trips: TripSummaryDto[] }) {
  if (trips.length === 0) {
    return (
      <p className="text-text-muted border-border rounded-[--radius-card] border border-dashed p-6 text-center text-sm">
        No trips yet. Create one to get started — then invite the people coming with you.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {trips.map((trip) => {
        const dates = formatDates(trip);

        return (
          <li key={trip.id}>
            <Link
              href={`/trips/${trip.id}`}
              className="border-border hover:border-brand-400 block rounded-[--radius-card] border p-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium">{trip.name}</span>
                <span className="text-text-muted shrink-0 text-xs uppercase tracking-wide">
                  {ROLE_LABEL[trip.myRole]}
                </span>
              </div>

              <p className="text-text-muted mt-1 text-sm">
                {trip.destination ?? 'Destination not set'}
                {dates ? ` · ${dates}` : ''}
              </p>

              <p className="text-text-muted mt-2 text-xs">
                {trip.memberCount} {trip.memberCount === 1 ? 'member' : 'members'} ·{' '}
                {trip.status.toLowerCase()}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
