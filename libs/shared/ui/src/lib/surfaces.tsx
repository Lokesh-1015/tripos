import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={
        `border-border bg-surface rounded-[--radius-card] border shadow-[--shadow-card] ` +
        (interactive
          ? 'transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[--shadow-raised] '
          : '') +
        className
      }
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="text-text-muted mt-1.5 text-sm">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * Empty state.
 *
 * Given real weight rather than a one-line apology: for a new user this IS the
 * product's first screen, and it should tell them what to do next.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-border bg-surface-muted flex flex-col items-center gap-3 rounded-[--radius-card] border border-dashed px-6 py-10 text-center">
      {icon ? <div className="text-text-subtle text-3xl">{icon}</div> : null}
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-text-muted mx-auto mt-1 max-w-sm text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'positive' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-text-muted',
  brand: 'bg-brand-50 text-brand-700',
  positive: 'bg-positive-soft text-positive',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-[--radius-pill] px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Alert({ children, tone = 'danger' }: { children: ReactNode; tone?: Tone }) {
  return (
    <p role="alert" className={`rounded-[--radius-control] px-3 py-2 text-sm ${TONES[tone]}`}>
      {children}
    </p>
  );
}
