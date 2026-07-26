# Architecture Decision Records

Each ADR records one decision: the context, the options considered, what we chose, what it costs us, and — most importantly — **what would make us revisit it**.

The last part is why these exist. In six months the reasoning behind a decision is gone, and without it a change is a guess rather than an informed reversal.

## Rules

- One decision per record. Numbered sequentially, never renumbered.
- **Never edit an accepted ADR's decision.** To change course, write a new ADR that supersedes it and update the old one's status to `Superseded by ADR-XXXX`.
- Statuses: `Proposed` → `Accepted` → `Superseded` / `Deprecated`.
- Write the ADR _when the decision is made_, not later. An ADR written from memory is fiction.
- Anything that introduces a third-party dependency, changes a boundary, or affects the data model needs one.

## Index

| #                                                   | Decision                                       | Status                                  |
| --------------------------------------------------- | ---------------------------------------------- | --------------------------------------- |
| [0001](0001-modular-monolith-over-microservices.md) | Modular monolith over microservices            | Accepted                                |
| [0002](0002-app-router-over-module-federation.md)   | Next.js App Router; no Module Federation       | Accepted                                |
| [0003](0003-clerk-as-identity-provider.md)          | Clerk as identity provider                     | Accepted                                |
| [0004](0004-zod-ts-rest-contracts.md)               | Zod as the contract source of truth            | Accepted (transport superseded by 0009) |
| [0005](0005-ledger-based-money-model.md)            | Append-only ledger for money                   | Accepted                                |
| [0006](0006-trip-membership-authorization.md)       | TripMembership-rooted authorization            | Accepted                                |
| [0007](0007-realtime-strategy.md)                   | Realtime strategy: deferred, then Socket.IO    | Accepted                                |
| [0008](0008-chat-in-mvp.md)                         | Group chat retained in MVP                     | Accepted                                |
| [0009](0009-orpc-replaces-ts-rest.md)               | oRPC replaces ts-rest as the transport binding | Accepted                                |
| [0010](0010-typescript-version-pin.md)              | Pin TypeScript to the 5.9 line                 | Accepted                                |
| [0011](0011-prisma-7-driver-adapters.md)            | Prisma 7 — driver adapters and external config | Accepted                                |

## Template

```markdown
# ADR-XXXX: <Title>

**Status:** Proposed | Accepted | Superseded by ADR-YYYY
**Date:** YYYY-MM-DD
**Deciders:** <who>

## Context

What forced a decision. Constraints, requirements, relevant facts.

## Options considered

Each with its real trade-offs — including the one we rejected but that a reasonable
engineer would have picked.

## Decision

What we chose, stated unambiguously.

## Consequences

**Positive** / **Negative** / **Neutral**. Be honest about the negatives; that is
what makes the record useful.

## Revisit when

Concrete, observable triggers. Not "when it becomes a problem."
```
