# ADR-0004: Zod + ts-rest as the contract layer

**Status:** Accepted; transport choice superseded by [ADR-0009](0009-orpc-replaces-ts-rest.md)
**Date:** 2026-07-26
**Deciders:** Lead architect

> **Superseded in part.** The core decision — _Zod as the single source of truth for every API shape_ — stands and is still authoritative. The transport binding named below (`ts-rest`) was replaced by **oRPC** before any code was written, after verification showed `ts-rest` had been unpublished for ~14 months and did not support Zod 4. See [ADR-0009](0009-orpc-replaces-ts-rest.md). Read this ADR for the _reasoning_ about contracts and drift; read 0009 for what we actually use.

## Context

`prd.md` §19 specifies a `packages/types` library for "global TypeScript types, DTOs shared between frontend and backend" and a `packages/sdk` for "API client layer / typed service communication."

Both are drift factories. A hand-written type shared between frontend and backend is only correct until someone changes the backend and forgets the type — and TypeScript cannot detect that, because the type _is_ the assumed truth. The same applies to a hand-written client. In practice this is the single most common source of bugs in Next + Nest monorepos: the types compile, the runtime disagrees.

Constraints:

- `prd.md` §15 specifies REST plus WebSockets, and §7 requires the architecture to permit native apps later without backend changes. Both argue for a language-agnostic wire format.
- Runtime validation is required regardless — external input must never be trusted, and TypeScript types vanish at runtime.
- We want one definition of every API shape, and we want it impossible to have two.

## Options considered

**A. Hand-written types + class-validator DTOs + hand-written client.** The PRD's implied approach. Three places to change for every API shape; drift is a matter of when, not if.

**B. OpenAPI-first with generated client and server types.** Language-agnostic and tool-rich, but adds a codegen step to every change, generated clients are ergonomically poor, and OpenAPI as hand-authored source is verbose and easy to get subtly wrong.

**C. tRPC.** Excellent DX and true end-to-end type safety with no codegen. But it couples clients to TypeScript and to the server's type graph, which forecloses the native-app and third-party-consumer paths §7 wants open, and it is not REST.

**D. ts-rest + Zod.** Contract defined once as Zod schemas; typed client and typed server handlers derived from it; OpenAPI emitted from the same contract. Stays REST over the wire.

**E. GraphQL.** Solves shape-sharing well, but adds a substantial layer — schema, resolvers, N+1 management, caching complexity — that this product does not need. Trip data is naturally document-shaped and fetched per-screen.

## Decision

**Option D: Zod as the single source of truth, `ts-rest` as the transport contract.**

- `libs/shared/contracts` holds every request/response schema as Zod. TypeScript types are derived with `z.infer` — **never hand-written**.
- The backend validates with the same schemas (`nestjs-zod`).
- The frontend consumes the `ts-rest` typed client generated from the same contract.
- `docs/api/` OpenAPI is **emitted** from the contract, never hand-edited.
- `packages/types` and `packages/sdk` from PRD §19 are both removed. They are replaced by one library that cannot drift.

`libs/shared/contracts` is the only library that both `scope:web` and `scope:api` may depend on. That constraint is enforced by the boundary tags in `CLAUDE.md` §4.

**Why Zod rather than a lighter validator:** it is the schema _and_ the type _and_ the validator simultaneously. That triple duty is precisely what eliminates drift — there is no second artifact to fall out of sync.

## Consequences

**Positive**

- Frontend/backend shape drift becomes structurally impossible rather than merely discouraged.
- Runtime validation is free at every boundary, including `$queryRaw` results.
- OpenAPI for future native apps and third parties comes at no extra authoring cost.
- No codegen step in the dev loop; changing a contract surfaces as type errors in every affected call site immediately.
- Domain events and job payloads can use the same schemas, so queue boundaries get validated too.

**Negative**

- Zod schemas add runtime bundle weight on the client. Mitigated by importing only the needed contracts and keeping schemas in the module graph of the routes that use them; monitor against the per-route bundle budget.
- Validation has a runtime cost on every request. Negligible at expected scale; revisit only if profiling says otherwise.
- `ts-rest` is a smaller ecosystem than tRPC or plain Nest controllers. Accepted: the contract is plain Zod, so if `ts-rest` were abandoned, the schemas — the valuable part — survive and only the transport binding is rewritten.
- Some Nest idioms (decorator-heavy DTO classes, `class-transformer`) are no longer used. Consistency matters more; `CLAUDE.md` §5 states the single approach.

**Neutral**

- Stays REST, satisfying PRD §15 and keeping the native-app path open.

## Revisit when

- A third-party or public API becomes a product surface, at which point lean harder on the emitted OpenAPI and consider versioning the contract package.
- Non-TypeScript consumers appear (a mobile app in Swift/Kotlin, a partner integration) — the OpenAPI output should already cover this, but validate that assumption before promising it.
- Client bundle measurement shows Zod schemas materially breaching the route budget — the mitigation is splitting `contracts` per domain, not abandoning the approach.
- `ts-rest` becomes unmaintained. Supersede with a new transport binding over the same Zod schemas.

Do not revisit "Zod as source of truth" independently of the transport. That part is the decision; `ts-rest` is an implementation detail of it.
