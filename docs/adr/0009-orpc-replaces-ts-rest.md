# ADR-0009: oRPC replaces ts-rest as the transport binding

**Status:** Accepted
**Date:** 2026-07-26
**Deciders:** Lead architect
**Supersedes:** the transport choice in [ADR-0004](0004-zod-ts-rest-contracts.md). That ADR's core decision — Zod as the single source of truth — stands unchanged.

## Context

ADR-0004 chose `ts-rest` as the transport binding over Zod contracts, and explicitly listed _"`ts-rest` becomes unmaintained — supersede with a new transport binding over the same Zod schemas"_ as a revisit trigger.

Verification during M0 setup, before any code was written, found that trigger already met:

| Fact                            | Value                                                 |
| ------------------------------- | ----------------------------------------------------- |
| `@ts-rest/core` latest stable   | `3.52.1`, published **2025-06-02** — ~14 months stale |
| `@ts-rest/core` RC              | `3.53.0-rc.1`, unreleased for the same period         |
| `@ts-rest/core@3.52.1` zod peer | `^3.22.3` — **no Zod 4 support**                      |
| Zod current                     | `4.4.3`                                               |

Adopting it would have meant either pinning Zod to the superseded 3.x line at the start of a greenfield project — with a major upgrade gated on an apparently dormant third party — or running Zod 4 against a peer range that excludes it, where `ts-rest` introspects schema internals that changed between majors. That is a runtime failure mode, not a compile-time one.

The requirements from ADR-0004 are unchanged: one Zod definition per API shape, runtime validation from that definition, a typed client derived from it, REST on the wire (PRD §15), OpenAPI emitted for future native apps (PRD §7), and no drift between frontend and backend.

## Options considered

**A. ts-rest + Zod 3.25.76.** The last 3.x, which ships a `zod/v4` subpath. Satisfies the peer range and works today. Rejected: starts a multi-year project on a superseded dependency line, with the upgrade path owned by a stalled project.

**B. oRPC** (`@orpc/server`, `@orpc/client`, `@orpc/nest`, `@orpc/openapi`, `@orpc/zod`) — all at `1.14.10`, published **2026-07-26**, the day of this decision. Contract-first, schema-agnostic via Standard Schema (so Zod 4 is supported directly), typed client with no codegen, OpenAPI generation, and a first-party NestJS adapter.

**C. nestjs-zod + @nestjs/swagger + generated client.** All actively maintained and thoroughly mainstream. Zod schemas validate on the server, `@nestjs/swagger` emits OpenAPI, and the frontend client is generated from that OpenAPI. Costs a codegen step, and client types derive from OpenAPI rather than directly from the Zod schema — a slightly weaker guarantee, though still not hand-written.

**D. tRPC.** Rejected in ADR-0004 for coupling clients to TypeScript and foreclosing the native-app and third-party paths. That reasoning is unchanged.

## Decision

**Option B: oRPC.**

- `libs/shared/contracts` defines contracts with `@orpc/contract` over **Zod 4** schemas. Unchanged from ADR-0004: one definition, `z.infer` for types, never a hand-written duplicate.
- `apps/api` implements contracts via `@orpc/nest`.
- `apps/web` consumes `@orpc/client`, fully typed from the same contract, **no codegen step**.
- `docs/api/` OpenAPI is emitted by `@orpc/openapi`. Still generated, never hand-edited.

Option C is the designated fallback, and it is a real one: because the valuable artifact is the Zod schemas, retreating to Option C means replacing the transport wiring while every schema survives. That property is why ADR-0004 separated "Zod as source of truth" from "the transport binding" in the first place, and it has now paid for itself once.

## Consequences

**Positive**

- Every dependency stays on a current, actively maintained major. No Zod 3 pin.
- Zod 4's improved performance and smaller bundle footprint, which matters against the per-route bundle budget.
- Still REST, still OpenAPI, still no codegen — every ADR-0004 requirement met.
- Standard Schema support means the contract layer is not coupled to Zod specifically. If Zod were ever replaced, contracts survive that too.

**Negative**

- oRPC is a younger project than the Nest/Next/Prisma tier. Its maintenance is currently excellent, but it carries less history. Mitigated by the Option C fallback and by keeping contract definitions free of oRPC-specific cleverness — plain schemas plus route metadata, nothing exotic.
- Smaller community, so fewer answers available when something goes wrong.
- The team learns oRPC's idioms rather than a more widely known library.

**Neutral**

- ADR-0004's central decision is untouched. This ADR replaces one named implementation detail.

## Revisit when

- oRPC publishes nothing for ~9 months, or its maintenance visibly stalls. Check this at the start of each milestone — it is a two-minute `npm view <pkg> time.modified` check, and this ADR exists because that check was worth running.
- A breaking oRPC major arrives with migration cost exceeding the switch cost to Option C.
- Non-TypeScript API consumers appear and the emitted OpenAPI proves insufficient in practice — validate that assumption before promising it to anyone.

## Process note

The general lesson, worth applying to every dependency: **check `time.modified` and the peer ranges before adopting, not after.** Two minutes of verification here avoided building the product's entire contract layer on a dormant library. `CLAUDE.md` §15 already requires an ADR for any new third-party service; this extends the same scrutiny to libraries that sit on a critical path.
