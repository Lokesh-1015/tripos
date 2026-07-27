/**
 * Shared design system.
 *
 * Design tokens live at `src/styles/tokens.css`, imported by
 * `apps/web/src/app/global.css`. Everything here is presentational — props in,
 * markup out, no data fetching — which is what makes these reusable across every
 * feature and testable in isolation (CLAUDE.md §13).
 */
export { Button, ButtonLink } from './lib/button';
export type { ButtonProps } from './lib/button';

export { Alert, Badge, Card, EmptyState, PageHeader } from './lib/surfaces';

export { Field, Input, Select } from './lib/form';
