# ADR-0005: Append-only ledger for money

**Status:** Accepted
**Date:** 2026-07-26
**Deciders:** Product owner, lead architect

## Context

`prd.md` §9 specifies budget estimation, expense tracking, equal split, custom split, settlement optimization, and expense history. It says nothing about how money is represented — no currency handling, no rounding policy, no statement of whether balances are stored or derived.

This is the highest-consequence data model in the product. Replacing Splitwise is the strongest single reason a group adopts TripOS, and money features fail in a specific, unforgiving way: **if the numbers are wrong even once, the group stops trusting the app and goes back to a spreadsheet.** There is no partial credit.

Two facts shape the model:

- **Group travel is inherently cross-border.** A trip from Mumbai to Bangkok involves INR and THB, possibly USD. Multi-currency is not a v2 feature; it is the common case.
- **Retrofitting currency, or converting stored mutable balances into a derived model, are among the ugliest migrations in existence** — they require reinterpreting historical rows whose original meaning is ambiguous.

An additional requirement the PRD omits entirely: **guest participants**. "Raj isn't on the app but owes ₹400" is an extremely common real case that Splitwise supports. It is a data-model decision, not a UI decision.

## Options considered

**A. Mutable balance columns.** A `balance` column per member, updated on each expense. Simple and fast to read. Rejected: any bug or partial failure silently corrupts state permanently, with no way to reconstruct the truth. Undo is impossible. Concurrent writes race. This is how money models fail.

**B. Expenses + shares, balances computed on read.** Better — the truth is derivable. But edits mutate expense rows, so history is lost; "why did my balance change?" is unanswerable; and settlements have no natural representation.

**C. Append-only ledger; balances derived.** Every monetary fact is an immutable signed entry. Balances are `SUM(entries)`. Corrections are reversing entries. Settlements are recorded transfers. Full auditability by construction.

**D. Double-entry bookkeeping with formal accounts.** The rigorous version. Correct, but the conceptual overhead is disproportionate for splitting a hotel bill between five friends, and the extra rigour buys nothing we need.

## Decision

**Option C**, with the following invariants. These are non-negotiable and restated in `CLAUDE.md` §6.

1. **Integer minor units, never floating point.** Money is a `Money` value object: `{ amountMinor: integer, currency: ISO-4217 }`. Bare numbers are never passed around.
2. **Multi-currency in the schema from day one**, even while the UI is single-currency. Every monetary row carries a currency.
3. **FX rates snapshotted at write time** — each entry stores `fxRateToTripBase` and the derived `baseAmountMinor`. A rate moving next week must never change last week's totals.
4. **The ledger is append-only.** `LedgerEntry { tripId, participantId, currency, amountMinor (signed), kind, sourceType, sourceId, createdAt }`. Rows are never `UPDATE`d or deleted. An expense edit produces a reversal plus a new entry.
5. **Balances are derived, never stored as mutable state.** `SUM` per `(tripId, participantId, currency)`, cached in Redis with explicit invalidation on write. The cache is disposable; the ledger is the truth.
6. **Deterministic largest-remainder rounding**, and the sum of split shares must equal the total **exactly**. Asserted in code, not merely tested — ₹100 split three ways must not lose a paisa.
7. **`TripParticipant` is decoupled from `User`**, so guests who are not app users can hold balances, with a claim flow when they later sign up.
8. **Settlements are recorded transfers**, not a UI flag — supporting partial payments and "paid outside the app."
9. **Expense creation requires an idempotency key.** Mobile networks retry; money must not double.
10. **All split and settlement math lives in `libs/api/expenses/domain` as pure functions**, property-tested, with no Prisma, Nest, or framework dependency anywhere near it.

Settlement optimization (PRD §9) is minimum-cash-flow over derived balances — a pure function over a balance snapshot, and therefore trivially testable.

## Consequences

**Positive**

- Balances cannot drift. If they look wrong, the ledger explains why — every entry has a source.
- Full audit history by construction, which is exactly what group financial disputes require.
- Undo and edit are safe operations rather than destructive ones.
- The highest-risk logic in the product is pure, framework-free, and property-testable.
- Multi-currency and guest participants are available when the UI is ready, with no migration.

**Negative**

- More writes per expense (one entry per participant rather than one row). Irrelevant at expected volume; Postgres handles this trivially.
- Reads require aggregation. Mitigated by the Redis cache; if that stops being enough, add materialized views or periodic balance snapshots — both are additive and do not change the model.
- Reversing entries mean the raw ledger is not a human-readable expense list. The UI reads from the expense projection, not the ledger directly.
- More upfront design than "add a balance column." This is the correct place to spend that effort.
- Requires PRD §9 to be amended with a data-model principles section.

**Neutral**

- Not formal double-entry. If TripOS ever needs real accounting semantics (business travel mode, per-diem reconciliation), that is a superseding ADR.

## Revisit when

- Aggregate query latency for balances exceeds the API p95 budget with the cache warm — add snapshots or materialized views; do not abandon the ledger.
- A trip's ledger volume grows beyond what a single aggregate can serve responsively (unlikely — trips are bounded by group size × trip length).
- Business-travel or per-diem features require true double-entry accounts (Option D).
- A regulated payment flow enters the product — if TripOS ever _moves_ money rather than recording it, the entire model needs a compliance review, not an amendment.
