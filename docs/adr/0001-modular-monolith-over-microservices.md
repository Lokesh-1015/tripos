# ADR-0001: Modular monolith over microservices

**Status:** Accepted
**Date:** 2026-07-26
**Deciders:** Product owner, lead architect

## Context

`prd.md` §12–14 and §19 specify eight independently deployed NestJS microservices (gateway, auth, user, trip, expense, notification, media, chat), while §16 states that "a shared database with clearly separated schemas is acceptable for rapid development."

Relevant facts at the time of deciding:

- The team is one developer. There are zero users.
- Eight services sharing one database is a **distributed monolith**: you pay network latency, deployment coordination, and partial-failure handling while remaining fully coupled through the schema. It has the costs of both architectures and the benefits of neither.
- Prisma makes this concrete: either every service redeclares the same models (guaranteed drift) or they share one `schema.prisma` (coupling, which negates the split).
- Authorization is the dominant cross-cutting concern — every feature is trip-scoped and must answer "is this user a member of trip X with role Y." Across eight services that becomes an RPC per request or replicated membership data. In one process it is one guard.
- Expense settlement requires atomic multi-row writes. Splitting expenses from trips while sharing a database means either cross-schema foreign keys (negating independence) or eventual consistency in an MVP ledger.

The genuine benefits of microservices — independent deploy cadence, per-service scaling, team autonomy, runtime heterogeneity — all require conditions that do not currently exist.

## Options considered

**A. Eight microservices, database per service.** The textbook version. Correct at scale, but requires distributed transactions or sagas for settlement, service discovery, distributed tracing, and eight deployment pipelines — before the first user exists.

**B. Eight microservices, shared database.** What the PRD literally describes. Rejected: distributed monolith, worst of both worlds, and technically awkward with Prisma.

**C. Modular monolith with mechanically enforced boundaries.** One `apps/api`, domains as Nx libraries with `feature → application → domain` layering, cross-domain communication only via published interfaces or a domain event bus, boundaries enforced by `@nx/enforce-module-boundaries` failing CI.

**D. Unstructured monolith.** Fastest short-term, but this is the technical debt the PRD explicitly wants to avoid, and it makes future extraction a rewrite.

## Decision

**Option C.**

- `apps/api` (NestJS), `apps/worker` (BullMQ), one Postgres, one Prisma schema owned solely by `libs/shared/database`.
- Every PRD service becomes a domain library set: `libs/api/<domain>/{domain,application,infrastructure,feature}`.
- Layering and cross-domain isolation enforced by ESLint tags in CI **from the first commit**.
- Cross-domain communication only via application-layer interfaces or the `EventBus` port in `libs/api/shared/events` — `EventEmitter2` in-process today, swappable for NATS or Redis Streams without touching domain code.
- `worker` is separate from day one, because background jobs genuinely differ from request handling in scaling and failure profile.
- `auth-service` is deleted from the architecture entirely (see ADR-0003).

**The key insight:** microservice boundaries are a _deployment_ decision, not a _code-organization_ decision. Nx gives us the code-organization boundary for free. We take that now and defer the network hop until it buys something.

## Consequences

**Positive**

- Four things to operate instead of fourteen.
- Atomic transactions across domains remain available — critical for the ledger.
- Authorization is one guard rather than a distributed concern.
- Refactoring across domain boundaries stays cheap while the domain model is still being discovered — which it very much is.
- Local development is a single process; debugging is a single stack trace.

**Negative**

- No independent deploy cadence. Any change redeploys the whole API. Acceptable at current team size; the trigger for revisiting is below.
- No per-domain scaling. A chat traffic spike scales the whole API. Mitigated because `worker` is already separate.
- Requires discipline. Without enforced tags this decays into option D — hence tags in CI from commit one, and the `CLAUDE.md` rule that a boundary lint error is never silenced with `eslint-disable`.
- Deviates from the PRD as written; §12–14 and §19 need amending.

**Neutral**

- The PRD's domain decomposition is preserved unchanged. This ADR changes the deployment topology, not the bounded contexts.

## Revisit when

Extract a specific domain into its own service when **any** of these becomes observably true:

- A domain needs independent scaling — most likely candidates are `media` (image/video processing is CPU-bound and bursty) and `chat` (connection-bound fan-out).
- A second team takes ownership of a domain and the shared deploy pipeline becomes a coordination bottleneck.
- A domain needs a different runtime or language (e.g. a Python AI service).
- Deploy frequency for one domain diverges sharply from the rest, and full-API redeploys become a release-risk problem.
- API build or CI time crosses a threshold that `nx affected` can no longer contain.

Extraction is a per-domain decision, not an all-or-nothing migration. Because boundaries are already enforced, the work is: replace the in-process `EventBus` adapter, promote the domain's application interfaces to network contracts (they are already Zod schemas — see ADR-0004), and split the schema's tables. Do **not** revisit this ADR wholesale; extract one domain and learn.
