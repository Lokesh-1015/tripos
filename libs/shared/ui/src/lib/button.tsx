import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[--radius-control] font-medium ' +
  'transition-[background-color,border-color,box-shadow,transform] duration-150 ' +
  // Focus is visible and consistent everywhere — keyboard users are not an
  // afterthought (WCAG 2.2 AA, CLAUDE.md §12).
  'focus-visible:outline-none focus-visible:shadow-[--shadow-focus] ' +
  'disabled:cursor-not-allowed disabled:opacity-55 active:translate-y-px';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-[--shadow-card]',
  secondary:
    'border border-border bg-surface text-text hover:border-border-strong hover:bg-surface-muted',
  ghost: 'text-text-muted hover:bg-surface-muted hover:text-text',
  danger: 'border border-danger/30 bg-danger-soft text-danger hover:border-danger/60',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  // 44px min height: the smallest reliable touch target on a phone, which is
  // where most of this product is used (CLAUDE.md §13).
  md: 'px-4 py-2.5 text-sm min-h-11',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Anchor styled as a button, for navigation that must remain a real link. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  href: string;
  target?: string;
  rel?: string;
}) {
  return (
    <a className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...rest}>
      {children}
    </a>
  );
}
