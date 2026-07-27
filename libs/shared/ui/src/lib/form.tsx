import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const CONTROL =
  'w-full rounded-[--radius-control] border border-border bg-surface px-3 py-2.5 text-sm ' +
  'text-text placeholder:text-text-subtle transition-[border-color,box-shadow] duration-150 ' +
  'focus:border-brand-400 focus:outline-none focus:shadow-[--shadow-focus] ' +
  'disabled:bg-surface-muted disabled:text-text-subtle';

/**
 * Label + control + hint, as one unit.
 *
 * Wrapping in a `<label>` associates the text with the control without needing
 * matching `id`/`htmlFor` pairs — one less thing to get wrong, and it makes the
 * whole row a tap target on mobile.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? (
        <span className="text-danger text-xs">{error}</span>
      ) : hint ? (
        <span className="text-text-muted text-xs">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...rest} />;
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${CONTROL} ${className}`} {...rest}>
      {children}
    </select>
  );
}
