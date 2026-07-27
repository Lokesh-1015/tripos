# CLAUDE.md — TripOS Engineering Conventions

Read this before writing code in this repository. It encodes decisions already made; it is not a menu of options.

> **Status:** M0 complete except Sentry. 13 projects; `typecheck`/`lint`/`test`/`build` all green, 29 unit tests. Working end to end: Clerk auth, the Clerk→`users` sync webhook (signature-verified and idempotent), a contract-derived typed API call rendered by the web app, Postgres + Redis with a migration applied, liveness/readiness probes, structured logging, Tailwind with design tokens, generated OpenAPI, and CI. `libs/api/users/*` is the reference implementation of the four-layer domain structure — copy it. Outstanding: Sentry (needs a DSN) and integration tests against a real Postgres via Testcontainers.

---

## 1. What this is

TripOS is a collaborative workspace for group travel — planning, decisions, money, logistics, and memories in one place. It is **not** a booking platform: it stores references and confirmations, never inventory, availability, or payments.

**Document map:**

| Document                    | Authority over                                          |
| --------------------------- | ------------------------------------------------------- |
| `prd.md`                    | Product vision, features, scope                         |
| `docs/prd-review.md`        | Architecture rationale, gaps, roadmap, risk register    |
| `docs/adr/`                 | Individual technical decisions and when to revisit them |
| **`CLAUDE.md`** (this file) | How code is written and organised                       |

If this file and `prd.md` disagree on a technical matter, this file wins and the PRD needs amending — log it in `docs/prd-changelog.md`.

---

## 2. Commands

```bash
pnpm install                      # never npm or yarn — pnpm only

pnpm dev                          # web (4200) + api (3000) + worker
pnpm nx dev web --port=4200       # single target
pnpm nx serve api

pnpm nx affected -t lint typecheck test build   # what CI runs
pnpm nx run-many -t typecheck lint test build   # everything

pnpm db:up                        # docker compose: postgres, redis, mailhog
pnpm db:down                      # stop, keep data
pnpm db:reset                     # stop and DESTROY local data
pnpm db:migrate                   # prisma migrate dev
pnpm db:deploy                    # prisma migrate deploy (CI/production)
pnpm db:studio                    # browse rows in a GUI
pnpm db:psql                      # interactive psql (needs a real terminal)

pnpm api:docs                     # regenerate docs/api/openapi.json from contracts
pnpm format                       # prettier write

pnpm nx g @nx/js:lib libs/<scope>/<domain>/<layer> --name=<scope>-<domain>-<layer> \
  --importPath=@tripos/<scope>/<domain>/<layer> --bundler=none \
  --unitTestRunner=vitest --linter=eslint --minimal --useProjectJson \
  --tags="scope:<scope>,type:<type>,domain:<domain>"
```

**New libraries need two follow-ups the generator does not do:** add a `typecheck` target to `project.json` (copy an existing one — `tsc -p <lib>/tsconfig.lib.json --noEmit` plus the spec config), and if the library imports an ESM-only package such as oRPC, set `"module": "esnext"` and `"moduleResolution": "bundler"` in its `tsconfig.json` so `exports` maps resolve.

**Infrastructure runs in Docker. Applications run on the host.** Do not containerise `web` or `api` for local development — it destroys hot-reload speed for no benefit. Docker is for Postgres, Redis, and Mailhog.

---

## 3. Workspace structure

```
apps/
  web/            Next.js App Router — the single frontend. Thin: routing + composition only.
  api/            NestJS modular monolith. Thin: module registration + bootstrap only.
  worker/         BullMQ consumers. Thin: queue wiring only.
  web-e2e/        Playwright
  api-e2e/

libs/
  api/<domain>/domain           entities, value objects, pure business rules
  api/<domain>/application      use cases, ports (interfaces), orchestration
  api/<domain>/infrastructure   Prisma repositories, external adapters
  api/<domain>/feature          Nest module, controllers, guards, gateways
  api/shared/{authz,events,errors,pagination,testing}

  web/<domain>/feature          route-level composition, page logic
  web/<domain>/ui               presentational components (no data fetching)
  web/<domain>/data-access      typed API calls, cache/query hooks
  web/shell/{layout,navigation,providers}

  shared/ui                     design system: tokens, Tailwind preset, shadcn primitives
  shared/contracts              Zod schemas → types → DTOs → client   ⭐ single source of truth
  shared/database               Prisma schema, generated client, migrations, seed  ⭐ sole owner
  shared/config                 typed env validation, feature flags
  shared/utils                  pure helpers
```

**Apps contain almost nothing.** All real code lives in libraries. If you are adding logic to `apps/api/src`, you are in the wrong place — the only exceptions are `main.ts`, the root module, and global bootstrap wiring.

Domains: `users`, `trips`, `expenses`, `itinerary`, `polls`, `checklists`, `documents`, `media`, `chat`, `notifications`, `shared`.

**Adding a domain requires adding its `domain:<x>` line to `depConstraints` in the root ESLint config** — without it the domain is unconstrained and cross-domain imports pass silently.

---

## 4. The layering rule

This is the most important rule in the repo, and it is enforced by ESLint (`@nx/enforce-module-boundaries`), not by good intentions. CI fails on violation.

```
feature ──▶ application ──▶ domain
                 │
infrastructure ──┘  (implements ports defined in application)
```

- **`domain`** — pure TypeScript. Zero imports from Nest, Prisma, Zod-transport, HTTP, or any library with I/O. Business rules and invariants live here. This is the layer that must be trivial to unit test.
- **`application`** — use cases. Defines **ports** (interfaces) for anything external. Depends only on `domain`.
- **`infrastructure`** — implements ports. Prisma lives _only_ here. Nothing imports from `infrastructure` except the Nest module that binds providers.
- **`feature`** — HTTP/WebSocket surface. Controllers, guards, gateways, DTO validation. No business logic — a controller that contains an `if` about business rules is a bug.

**Dependencies point inward. `domain` imports nothing outward, ever.**

### Tags

Every project declares tags in its `project.json`:

- `scope:api` | `scope:web` | `scope:shared`
- `type:app` | `type:feature` | `type:ui` | `type:data-access` | `type:application` | `type:domain` | `type:infrastructure` | `type:util`
- `domain:trips` | `domain:expenses` | … | `domain:shared`

Enforced constraints (in the root ESLint config):

| A project tagged…     | may depend only on…                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `scope:web`           | `scope:web`, `scope:shared`                                                                          |
| `scope:api`           | `scope:api`, `scope:shared`                                                                          |
| `scope:shared`        | `scope:shared`                                                                                       |
| `domain:<x>`          | `domain:<x>`, `domain:shared`                                                                        |
| `type:feature`        | `type:application`, `type:domain`, `type:infrastructure`, `type:ui`, `type:data-access`, `type:util` |
| `type:application`    | `type:domain`, `type:util`                                                                           |
| `type:domain`         | `type:domain`, `type:util`                                                                           |
| `type:infrastructure` | `type:infrastructure`, `type:application`, `type:domain`, `type:util`                                |
| `type:data-access`    | `type:data-access`, `type:domain`, `type:util`                                                       |
| `type:ui`             | `type:ui`, `type:util`                                                                               |

`feature` may see `infrastructure` because the Nest module there is the **composition root** — binding a port to its adapter is precisely its job, and no other layer is allowed to know both. The invariant that matters is the one above it: **`application` and `domain` can never reach `infrastructure`**, which is what keeps business logic testable without a database.

**`scope:web` may never import `scope:api`.** The only thing crossing that boundary is `shared/contracts`.

### Cross-domain communication

A domain module may **not** reach into another domain's `domain` or `infrastructure`. Two legal paths:

1. **Published application interface** — import the other domain's `application` port and depend on the interface.
2. **Domain events** — emit through the `EventBus` port in `api/shared/events`. In-process (`EventEmitter2`) today; the adapter swaps for NATS/Redis Streams if a module is ever extracted, and no domain code changes.

Prefer events for anything that is a notification of fact ("expense was created"). Prefer direct interfaces only when you need a synchronous answer.

**Why this matters:** these boundaries are what make the modular monolith extractable into services later (ADR-0001). Every violation is a future service extraction that turns into a rewrite. Treat a boundary lint error as a design signal, not an obstacle to silence — never add an `eslint-disable` for it without an ADR.

### Every new NestJS project needs the Nest ESLint overlay

Any project containing Nest injectables — `apps/api`, `apps/worker`, and every `libs/api/<domain>/feature` — must extend `eslint.nest.mjs` as well as the root config:

```js
import baseConfig from '../../eslint.config.mjs';
import nestConfig from '../../eslint.nest.mjs';
export default [...baseConfig, ...nestConfig];
```

Without it, `consistent-type-imports` will "fix" an injectable's import into `import type`, which erases the constructor metadata Nest relies on and breaks dependency injection **at runtime**, with no compile error. The file explains it in full.

---

## 5. Contracts — the anti-drift rule

`libs/shared/contracts` is the single source of truth for every API shape.

- Define a **Zod 4 schema** once. Derive the TypeScript type with `z.infer`. Never hand-write a type that duplicates a schema.
- Backend validation and frontend types come from that same schema. **Drift is structurally impossible**, which is the entire point.
- Transport is **oRPC** (`@orpc/contract`, `@orpc/nest`, `@orpc/client`, `@orpc/openapi`): contract-first REST, typed client with no codegen, OpenAPI emitted for free (needed for future native apps).
- OpenAPI in `docs/api/` is **generated**. Never hand-edit it.

There is no `types` package and no hand-written SDK. Both were rejected as drift factories (ADR-0004, ADR-0009).

**Before adding any dependency on a critical path**, check `npm view <pkg> time.modified` and its peer ranges. This is how we caught `ts-rest` being 14 months stale _before_ building the contract layer on it (ADR-0009).

---

## 6. Money — non-negotiable invariants

The highest-consequence code in the product. See ADR-0005.

- **Never floating point.** Money is `{ amountMinor: number (integer), currency: ISO4217 }`. There is a `Money` value object in `libs/api/expenses/domain` — use it; do not pass bare numbers around.
- **Multi-currency from day one**, even while the UI is single-currency. Every monetary row carries a currency.
- **FX rates are snapshotted at write time** (`fxRateToTripBase`, `baseAmountMinor`). Historical totals must never change because a rate moved.
- **The ledger is append-only.** `LedgerEntry` rows are never `UPDATE`d or deleted. Corrections are **reversing entries**. Edits create a reversal plus a new entry.
- **Balances are derived**, never stored as mutable state. `SUM(ledger)` per `(tripId, userId, currency)`, cached in Redis with explicit invalidation on write.
- **Rounding is deterministic largest-remainder**, and the sum of split shares must always equal the total exactly. Assert this in code, not just in tests.
- **All split and settlement math lives in `expenses/domain` as pure functions** and is property-tested. No Prisma, no Nest, no framework anywhere near it.
- Expense creation requires an **idempotency key**. Mobile networks retry; money must not.

---

## 7. Authorization

See ADR-0006. `TripMembership { tripId, userId, role, status }` is the authorization root; roles are `OWNER | ADMIN | MEMBER | VIEWER`.

- Every trip-scoped endpoint uses `TripAccessGuard` with `@RequiresTripRole(...)`. There is no second mechanism.
- Permission logic lives as **pure policy functions** in `libs/api/shared/authz` (`canDeleteExpense(actor, expense)`), unit-tested in isolation. Not inline `if` statements in controllers.
- **Every repository method that touches trip-scoped data takes `tripId`.** Design it so an unscoped query is awkward to write, not merely discouraged.
- WebSocket room joins are authorized with the same guard logic. Never trust a client-supplied `tripId`.
- Clerk owns _authentication only_. Authorization is entirely ours.

**Identity boundary:** every domain table references the internal `User.id`. `clerkUserId` appears in exactly one place — the `User` table. Trips are **not** Clerk Organizations.

---

## 7a. Environment files — read this before creating a `.env`

**Never put `NODE_ENV` in `.env` or `.env.example`.** Next.js auto-loads env files for _every_ command, so a `NODE_ENV=development` line makes `next build` emit a production bundle while React resolves its development runtime. The symptom is a prerender failure with `TypeError: Cannot read properties of null (reading 'useContext')` on `/_not-found` or `/_global-error` — which looks exactly like a duplicate-React or version-mismatch problem and will send you chasing dependency versions for an hour. `NODE_ENV` is set by the tooling (next, nx, docker, CI), never by a file.

Related: `.env.example` is committed, `.env` never is. Add a variable to the Zod schema in `libs/shared/config` and to `.env.example` in the same commit.

**Windows caveat:** never write `.env` (or any config file) with PowerShell's `Set-Content -Encoding utf8` — in PowerShell 5.1 that emits a UTF-8 **BOM**, which corrupts the first key for most env parsers. Use `[System.IO.File]::WriteAllLines($path, $lines, (New-Object System.Text.UTF8Encoding($false)))`, or just edit the file directly.

**Local ports.** `web` runs on **4200**, `api` on **3000**, Postgres on **127.0.0.1:55432**, Redis on **127.0.0.1:56379**. The datastore ports are non-default deliberately (see §8 and docker-compose). `.claude/launch.json` encodes the app ports.

## 8. Database

- `libs/shared/database` is the **sole owner** of `schema.prisma` and the generated client. No other library imports `@prisma/client` directly; repositories in `infrastructure` layers import from this lib.
- **Prisma 7 specifics** (ADR-0011): the datasource block has no `url` — the migrate connection string lives in `prisma.config.ts` at the root. The runtime client needs a driver adapter, built via `createPrismaClient(connectionString)`. That factory is framework-free on purpose; do not add Nest decorators to it. Most Prisma material online still assumes v6.
- One Postgres, one schema. Migrations are reviewed like code and never edited after merge.
- Every table gets `id`, `createdAt`, `updatedAt`. Mutable user content also gets `createdById`, `updatedById`, `deletedAt` (soft delete) — retrofitting audit columns is painful, adding them now is free.
- **Ordering uses fractional/lexicographic rank strings**, not integer positions. Reordering one itinerary item must not rewrite its siblings.
- **Pagination is cursor-based** on `(createdAt, id)`. Offset pagination is banned on append-heavy tables (messages, ledger, activity) — it duplicates and skips rows as data arrives.
- Complex aggregates (balances, trip replay stats) may use `$queryRaw`. Validate the result with a Zod schema at the boundary. This is normal and expected.

## 9. Time

- Store instants as UTC `timestamptz`. Every trip carries an **IANA timezone**; itinerary items may override it.
- Render in trip-local time by default, not viewer-local.
- All-day items are **dates**, not instants. Never timezone-shift them.

---

## 10. TypeScript

Strict, with the extras enabled from day one (`tsconfig.base.json`):

`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`

**TypeScript is pinned to exactly `5.9.3`**, not `latest` (currently 7.x). NestJS ships with 5.9.3 and `typescript-eslint` declares `typescript <6.1.0`, so TypeScript 7 would cost us type-aware linting. Deliberate, documented, and revisited every milestone — see ADR-0010. Do not bump it casually.

**Framework packages are pinned to exact versions** — `next`, `react`, `react-dom`, `typescript`, and the `@nx/*` set. Ranges let a transitive dependency resolve a second copy of a framework: `eslint-config-next` on a different minor than `next` installs two Next.js copies, and duplicate React or Next produces baffling runtime failures. Keep `next` and `eslint-config-next` on the _same_ version, always.

**Before adopting or bumping a dependency on a critical path**, check `npm view <pkg> time.modified` and its peer ranges (see §5). Prefer a release that is a couple of weeks old: pnpm's `minimumReleaseAge` gate rejects very fresh publishes because that window is when a hijacked release is most likely live. If `pnpm add` offers to write `minimumReleaseAgeExclude` entries, decline and pin an older version instead — that list should stay empty.

- **`any` is banned.** Use `unknown` and narrow. If you truly need an escape hatch, it needs a comment explaining why.
- **No non-null assertions (`!`)** on values that could genuinely be absent. Narrow properly.
- **No type assertions to launder unvalidated data.** External input is parsed with Zod, never cast.
- Prefer discriminated unions over optional-field soup. Prefer `readonly` on domain types.
- Absolute imports via path aliases (`@tripos/…`). No `../../..`.

## 11. Naming

- Files: `kebab-case.ts`. React components: `PascalCase.tsx`.
- Nest: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.repository.ts`, `*.guard.ts`.
- Use cases: verb-first — `create-trip.use-case.ts`.
- Ports are interfaces named for the role: `TripRepository`, `EventBus`, `FileStorage`. Implementations name the technology: `PrismaTripRepository`, `R2FileStorage`.
- Zod schemas: `createTripSchema`; inferred types: `CreateTripInput`.
- Booleans read as assertions: `isArchived`, `hasSettled`, `canEdit`.

---

## 12. Testing

- **Unit** (Vitest) — `domain` layers. Fast, no I/O. Money math is **property-tested**.
- **Integration** (Vitest + Testcontainers) — `application` + `infrastructure` against **real Postgres**. Do not mock Prisma; a passing test against a mocked Prisma proves nothing.
- **E2E** (Playwright) — the critical path only: sign up → create trip → invite → accept → add expense → settle.
- **Accessibility** — `axe` in CI. Target WCAG 2.2 AA.

Must have tests, no exceptions: money math, authorization policies, split/settlement, invite token lifecycle, anything touching PII access.

**`web` has no `typecheck` target, on purpose.** `apps/web/tsconfig.json` includes `.next/types/**`, which only exists after a build — so a standalone typecheck passes or fails depending on whether a build ran first (Nx correctly flagged it as a flaky task). `next build` runs TypeScript itself, so web type errors surface in `build`. Don't "fix" this by adding the target back.

---

## 13. Frontend

- Server Components by default. `"use client"` only where interactivity genuinely requires it, and as deep in the tree as possible.
- **Business logic does not live in components.** Components render; `data-access` fetches; domain rules live server-side. A component doing money math is a bug.
- `ui` libraries are presentational and have **no data fetching** — props in, markup out. That is what makes them testable and reusable.
- Design tokens in `shared/ui`. No hardcoded hex values or magic spacing in feature code.
- **Mobile-first, always.** Design the 375px view first; the desktop layout is the enhancement. Most of this product is used on a phone, on hotel wifi.
- Every user-facing string goes through `next-intl`. No hardcoded copy — cheap now, a full-codebase refactor later.
- Optimistic UI for anything a user does repeatedly, with real error recovery. Not a spinner over the whole page.

---

## 14. Security & privacy

Read `docs/security.md` before touching documents, media, or location. Non-negotiables:

- Uploads go to a **private** bucket. Access is via **short-TTL signed URLs**, issued only after a server-side authorization check, and every issuance is audit-logged.
- **Strip EXIF from every uploaded image.** Photos carry GPS; a shared gallery would otherwise leak precise hotel and home locations to the whole trip.
- Validate upload MIME types by **content**, not file extension. Enforce size limits. Scan for malware.
- Passport/insurance documents are the most sensitive data in the product. They are **excluded from offline caching** and never included in a generic export.
- Live location: explicit per-session opt-in, hard auto-expiry, no historical trail retained, visible active indicator, one-tap kill switch.
- Rate-limit auth, invites, uploads, and messaging. An unbounded invite endpoint is a spam vector.
- Secrets come from the platform secret store. `.env.example` is committed; `.env` never is. No secret ever reaches the client bundle — anything in `NEXT_PUBLIC_*` is public, treat it as such.
- Structured logs (`pino`) with correlation IDs. **Never log PII, tokens, or full request bodies.**

---

## 15. Always / Never

**Always**

- Put business logic in `domain`, behind an interface, testable without a framework.
- Define the Zod contract first, then implement against it.
- Scope trip data queries by `tripId` at the repository layer.
- Add an ADR when you make a decision someone will later ask "why?" about.
- Reuse the primitives: `Poll`, `Comment`, `Attachment`, `Checklist`, `Activity`, `Notification`. Five voting features are **one** poll implementation.

**Never**

- `eslint-disable` a module-boundary error. Fix the design or write an ADR.
- Import Prisma outside `shared/database` and `infrastructure` layers.
- Store money as a float, or a balance as a mutable column.
- `UPDATE` or `DELETE` a ledger row.
- Reference `clerkUserId` from a domain table.
- Model a trip as a Clerk Organization.
- Hand-write a type that a Zod schema already describes.
- Use offset pagination on messages, ledger entries, or activity.
- Add a feature-specific implementation of comments, polls, or attachments.
- Introduce a new third-party service without an ADR covering cost, lock-in, and the exit path.

---

## 16. Current state

**Milestone: M0 — Foundation.** Roadmap in `docs/prd-review.md` §7.

Decided (ADRs 0001–0008): modular monolith with enforced boundaries; App Router, no Module Federation; Clerk for authentication; Zod + ts-rest contracts; ledger-based money model; `TripMembership` authorization; Socket.IO on the persistent tier; chat in MVP at M6.

Open, with owners: Mapbox vs. MapLibre (by M8), transactional email provider (defaulting to Resend, by M6), late-joiner chat history visibility (product call, by M6), guest-participant claim UX (schema at M3).
