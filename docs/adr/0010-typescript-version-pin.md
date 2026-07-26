# ADR-0010: Pin TypeScript to the 5.9 line, not the latest major

**Status:** Accepted
**Date:** 2026-07-26
**Deciders:** Lead architect

## Context

`CLAUDE.md` §10 mandates strict TypeScript, and the project's stated philosophy favours current, well-supported dependencies. At M0 setup, the published TypeScript landscape is:

| Tag      | Version      |
| -------- | ------------ |
| `latest` | `7.0.2`      |
| `beta`   | `6.0.0-beta` |
| last 5.x | `5.9.3`      |

Taking `latest` would normally be the default. However, TypeScript 7 is the native (Go) compiler rewrite, and the toolchain we depend on has not moved with it:

- **`typescript-eslint@8.65.0` declares `typescript: ">=4.8.4 <6.1.0"`.** This is decisive on its own: choosing TypeScript 7 means giving up type-aware linting, which `CLAUDE.md` depends on for the boundary and type-safety rules. There is no version of typescript-eslint that supports 7.
- **`@nestjs/cli` depends on `typescript@5.9.3` directly** — Nest's own build tooling is on the 5.9 line.
- Note for the next revisit: `typescript-eslint`'s `<6.1.0` bound means the **6.0.x line is permitted**, and `@nx/eslint@23.1.0` in fact bundles `typescript@6.0.3` internally for its own use. So 6.0.x — not 7.x — is the realistic next step, and the blocker to check is NestJS rather than the linter.
- `@nestjs/schematics` declares `typescript: >=4.8.2`, which is permissive but tells us nothing about testing against 7.
- Nx 23 and Next 16 are the versions we are adopting, and both were developed and tested against the 5.x line.

NestJS's dependency injection relies on decorator metadata emission, which is the area of the compiler most affected by the native rewrite. Rather than speculate about specifics, the decisive fact is simpler: **the framework we are building the API on ships with 5.9.3, and nothing in our toolchain claims support for 7.** Debugging a compiler-compatibility issue in the first week of a greenfield project is the worst possible use of time — there is no working baseline to bisect against.

## Options considered

**A. TypeScript 7.0.2 (`latest`).** Substantially faster compilation, which compounds across a monorepo. But unproven against Nest, Nx 23, and Next 16 in this combination, and the failure mode (DI metadata) would be subtle and hard to diagnose.

**B. TypeScript 5.9.3.** What NestJS ships with and what Nx and Next were tested against. All strict flags this project requires (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`) exist and are stable in 5.x.

**C. 6.0.0-beta.** A beta. Not a candidate for a foundation.

**D. Different versions per app** — 7 for `web`, 5.9 for `api`. Rejected: one TypeScript per workspace. Divergent compiler versions across libraries that share types is a debugging nightmare, and `libs/shared/contracts` is consumed by both sides.

## Decision

**Pin `typescript` to `5.9.3` workspace-wide**, as an exact version rather than a range, so a transitive resolution cannot silently move the compiler underneath us.

This is a deliberate, temporary deviation from "use current majors." It is not a reflection on TypeScript 7 — it is a statement that M0's job is a **verified, boring baseline**, and the compiler is the wrong place to be adventurous when nothing above it has caught up.

None of the strict-mode requirements in `CLAUDE.md` §10 are compromised by this choice.

## Consequences

**Positive**

- A known-good combination across Nest, Nx, Next, and Prisma. If something breaks in M0, the compiler is not a suspect.
- Every strict flag we want is available.
- Exact pinning means reproducible builds.

**Negative**

- Slower type-checking than the native compiler would give us. Real, and it will get more noticeable as the monorepo grows — mitigated by `nx affected` and Nx caching. This is the main cost and the main reason to revisit.
- We are deliberately behind `latest`, which needs to be a conscious, documented position rather than neglect — hence this ADR.
- Exact pinning means upgrades are explicit work rather than automatic. That is the intent.

**Neutral**

- Reversal is cheap: change one version, run `nx run-many -t typecheck build test`, and see what happens. Unlike most decisions in this repo, this one is a single-line experiment.

## Revisit when

- **`@nestjs/cli` moves its `typescript` dependency to 7.x.** This is the primary signal — check it at the start of each milestone.
- Nx and Next both document support for TypeScript 7.
- Type-check or build time becomes a genuine drag on the development loop and the native compiler's speed is worth an upgrade attempt.
- Re-evaluate at the start of every milestone regardless. This pin should not outlive its justification — an unexamined version pin becomes exactly the kind of technical debt the PRD's development philosophy is meant to prevent.
