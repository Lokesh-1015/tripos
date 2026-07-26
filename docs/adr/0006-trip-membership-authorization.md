# ADR-0006: TripMembership-rooted authorization

**Status:** Accepted
**Date:** 2026-07-26
**Deciders:** Product owner, lead architect

## Context

`prd.md` §9 lists "Member roles" as a single bullet. That is the entire specification of authorization in a 969-line document.

Meanwhile every feature in TripOS is trip-scoped. Every request must answer: _is this user a member of this trip, with sufficient role, for this action, on this resource?_ Itinerary edits, expense deletion, member removal, document-vault access (which holds passport scans), poll closing, chat room joins, data export — all of it.

Authorization is therefore the single most cross-cutting concern in the product, and it was the largest omission in the PRD. It is also the concern most expensive to retrofit: if it is not designed up front, every module invents its own inconsistent checks, and the gaps between them are security holes.

Clerk owns authentication (ADR-0003) and knows nothing about trips. Authorization is entirely ours.

## Options considered

**A. Inline role checks in controllers.** Fastest to write, and the reason most applications have authorization bugs. Every endpoint is a fresh opportunity to forget a check, and there is no way to audit coverage.

**B. Guard + decorator + centralised pure policy functions.** One `TripAccessGuard` resolves trip context and membership; `@RequiresTripRole()` declares the coarse requirement; fine-grained rules are pure functions unit-tested in isolation.

**C. CASL (or similar ability library).** Powerful and declarative, with good support for conditional/attribute rules. Adds a dependency and an abstraction layer whose value appears when permission rules are genuinely complex or user-configurable — which ours are not yet.

**D. Postgres Row-Level Security.** Enforcement at the last possible layer, which is the strongest guarantee available. But it is hard to express role-and-action rules in policies, it complicates migrations and connection pooling, and Prisma support is awkward.

## Decision

**Option B**, with Option D retained as future defence in depth.

**Authorization root:** `TripMembership { tripId, userId, role, status, joinedAt }`. Roles: `OWNER | ADMIN | MEMBER | VIEWER`.

- `OWNER` — one per trip; full control including deletion and ownership transfer.
- `ADMIN` — manage members, close polls, pin messages, edit trip settings.
- `MEMBER` — full participation: add expenses, edit itinerary, upload, chat.
- `VIEWER` — read-only. Covers the real case of a parent funding a trip without participating.

**Mechanism:**

1. **One `TripAccessGuard`** resolving `tripId` from params/body/query, loading membership, attaching it to the request context. There is no second mechanism — `CLAUDE.md` §7 states this as a rule.
2. **`@RequiresTripRole(...)`** for the coarse-grained requirement on every trip-scoped endpoint.
3. **Pure policy functions** in `libs/api/shared/authz` for fine-grained, resource-aware rules: `canDeleteExpense(actor, expense)`, `canRemoveMember(actor, target)`. Framework-free, unit-tested in isolation, and — critically — auditable as a single readable set of rules rather than scattered conditionals.
4. **Every repository method touching trip-scoped data takes `tripId`.** Designed so an unscoped query is awkward to write, not merely discouraged.
5. **WebSocket room joins use the same guard logic** (ADR-0007, ADR-0008). A client-supplied `tripId` is never trusted.
6. **Membership is verified server-side on every request.** Never inferred from a client claim or a cached frontend value.

**Policy decisions the PRD left open, now settled:**

- **Owner departure:** an `OWNER` cannot leave without transferring ownership. Prevents orphaned trips.
- **Removed members:** their historical contributions persist — required for ledger integrity (ADR-0005), where deleting a member's expenses would corrupt the group's balances. Access is revoked; the record remains. This must be stated in the privacy policy.
- **Expense deletion:** author or `ADMIN`+. Deletion is a reversing entry, never a destructive delete.
- **Document vault:** `MEMBER`+ to read, uploader or `ADMIN`+ to delete, every access audit-logged. Because this holds passports, it gets the strictest treatment of any resource (`docs/security.md`).
- **Data export:** `OWNER`/`ADMIN` for trip-wide export; any user for their own personal data (§4.9 of the review).

## Consequences

**Positive**

- One place to reason about access, and one place to audit it.
- Policy functions are pure, so the security-critical logic is the easiest code in the repo to test exhaustively.
- Strong argument realised in practice for ADR-0001: in one process this is a single guard, whereas eight services would each need to re-derive membership via RPC or replicated data.
- Adding a role or a rule is a localised change.

**Negative**

- Every trip-scoped request costs a membership lookup. Mitigated by caching membership in Redis keyed on `(tripId, userId)` with invalidation on membership change — and correctness comes first: never serve a stale permission.
- Guards can be forgotten on a new endpoint. Mitigation: default-deny — the base controller pattern requires an explicit decorator, and any endpoint lacking one fails closed. Add an integration test that enumerates routes and asserts every trip-scoped route carries a role decorator.
- Four roles will not cover every future case (per-module permissions, custom roles, granular sharing). Accepted for MVP.

**Neutral**

- Clerk remains authentication-only. This separation is deliberate and load-bearing.

## Revisit when

- Per-module or per-resource permissions diverge enough that four roles stop expressing them — that is the signal to adopt CASL (Option C).
- Customer demand appears for custom roles or granular sharing (likely with corporate-travel customers).
- A security review recommends enforcement at the database layer — adopt Postgres RLS (Option D) **in addition to**, never instead of, the application layer.
- Membership-lookup latency shows up in API p95 with the cache warm.
