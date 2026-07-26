# ADR-0008: Group chat retained in MVP

**Status:** Accepted
**Date:** 2026-07-26
**Deciders:** Product owner (decision), lead architect (dissenting recommendation, recorded below)

## Context

`prd.md` §9 specifies trip-scoped group chat supporting images, files, polls, locations, and pinned messages, and §23 lists "communicate within the trip" as an MVP requirement. The whole specification is six bullet points, for what is one of the largest modules in the product.

The lead architect recommended cutting chat from MVP in favour of contextual comments plus an activity feed. That recommendation was **not** accepted. Both positions are recorded here because the trade-off is real and the revisit triggers depend on understanding it.

**The case against chat in MVP (architect):**

- TripOS would be competing with WhatsApp for a group's conversation. Groups rarely migrate an existing thread — it already contains people who are not on the trip and never will be.
- Chat is expensive to build properly: history pagination, delivery states, offline queue, mentions, edit/delete, moderation, media handling, push notification reliability, retention.
- **Partial adoption is worse than none.** Half the discussion here and half in WhatsApp makes coordination _more_ fragmented — the exact problem `prd.md` §4 exists to solve.

**The case for chat in MVP (product owner), which is grounded in the PRD's own text:**

- §8 defines the product philosophy as "Notion + Splitwise + Google Maps + **WhatsApp** + Google Drive + Calendar." Chat is named in the core philosophy, not the feature backlog. Cutting it contradicts the stated vision.
- §23 defines MVP success as a group organising an entire trip "**without relying on multiple external applications**." If users must leave TripOS to talk, the MVP fails by its own definition.
- Fragmentation reasserts itself precisely at the context switch. A trip-scoped thread that can hold a pinned hotel address, a shared location, and a poll is materially different from a generic chat — especially _during_ the trip, which is when external apps are least convenient.

The product owner's argument is sound on its own terms. The dissent is about adoption risk and cost, not about coherence.

## Options considered

**A. Contextual comments + activity feed only.** Threaded comments on polls, itinerary items, expenses, and documents, plus share-to-WhatsApp. Roughly 15% of the cost of chat, reuses the `Comment` primitive, and ensures decisions are never lost in a scroll. The architect's recommendation.

**B. Full chat in MVP.** As specified in §9.

**C. Both.** Comments early, chat later in the MVP sequence.

## Decision

**Option C, weighted toward B: chat is in MVP, built at M6, with contextual comments shipped at M2.**

Both are in scope, and this is not a compromise for its own sake — comments and chat reuse the same `Comment`, `Attachment`, and `Poll` primitives (`docs/prd-review.md` §4.4), so shipping comments at M2 costs little and de-risks chat by ensuring decisions are anchored to objects regardless of where discussion happens.

**The design constraint that discharges the adoption risk:** do not build generic messaging. Build messaging that **anchors to trip objects** — a message can reference, and be promoted into, a poll, an expense, or an itinerary item. That is the one thing WhatsApp structurally cannot do, and therefore the only credible reason for a group to move. Generic chat that is merely _adequate_ will lose to the thread they already have. This constraint is what makes the feature worth building rather than merely present.

**Sequenced at M6, after the M5 dogfood gate.** This ordering is deliberate: running a real trip through TripOS at M5 reveals which conversations groups actually have and what they need anchored. Building chat at M2 would be guessing; building it at M6 means designing against observed behaviour. The late slot is a feature of the plan, not a deprioritisation.

**Specification** (replacing §9's six bullets) is in `docs/prd-review.md` §4.10. The details that are expensive to retrofit:

- `clientMessageId` on every message — idempotent retries on flaky mobile networks _and_ the reconciliation key for optimistic UI.
- Cursor pagination on `(createdAt, id)`. Offset pagination on an append-heavy table duplicates and skips rows as messages arrive.
- Per-member `lastReadMessageId` with derived unread counts, **not** per-message read receipts (an N×M table growing with group size × message count).
- Append-only with tombstones (`editedAt`, `deletedAt`) — required for moderation and dispute resolution.
- Attachments, locations, and polls are **references to existing primitives**, never chat-specific implementations. Chat inherits polls for free and media inherits EXIF stripping.
- Room join authorized via the same policy layer as HTTP (ADR-0006).

**Deferred within chat**, to keep it tractable without weakening it: typing indicators, read receipts, threads, DMs, voice notes, message search (which arrives cheaply later via Postgres full-text search).

## Consequences

**Positive**

- §23's MVP criterion is satisfiable as written — a group can complete a trip without leaving TripOS.
- The product matches the philosophy in §8 rather than contradicting it.
- Anchored messages are a genuine differentiator, not feature parity.
- During-trip use, where switching apps is most inconvenient, is covered.

**Negative — accepted**

- **Realtime is no longer deferrable.** Socket.IO plus the Redis adapter become hard M6 requirements (ADR-0007).
- **Transactional email and web push become part of the feature**, not adjacent niceties. An unread message nobody is notified about is worse than no chat at all. A provider must be chosen by M6 (defaulting to Resend).
- M6 grows from ~2 weeks to ~3–4 weeks, making it the largest milestone.
- Ongoing surface area: moderation, abuse reporting, rate limiting, retention, and the interaction with account deletion (a departing user's messages must be handled without corrupting group history).
- **The adoption risk is real and unmitigated by engineering.** Mitigations are product-level: anchoring, notification reliability, and comments as a parallel path.

**Neutral**

- Chat is a domain library like any other (`libs/api/chat/*`), so if it proves unloved it can be feature-flagged off or, per ADR-0001, extracted — connection-bound fan-out makes it the likeliest first extraction candidate anyway.

## Revisit when

Measure, do not speculate. Instrument from the day chat ships.

- **Four weeks after M6 with real trips running:** if fewer than half of active trips exchange a meaningful volume of messages per week, chat is not being adopted. Reduce investment to maintenance rather than adding features to it.
- **If groups report keeping a parallel WhatsApp thread** — the specific failure the dissent predicted. Signal to double down on anchoring and notification reliability, or to accept chat as a secondary surface and reinvest in comments.
- **If the anchoring features go unused** while plain text dominates, the differentiation thesis is wrong and chat is competing with WhatsApp on WhatsApp's terms — a losing position worth exiting.
- **Conversely:** if message volume is high and anchoring is used, chat is a genuine moat. Then revisit the deferred sub-features (search first, then threads).
- If moderation or abuse load requires meaningful ongoing human attention, reassess whether a small team can carry the feature.

Note that **the outcome need not be removal.** The realistic outcomes are: invest more (it is working), hold at maintenance (it is used but not loved), or feature-flag it off for new trips (it is unused). Deleting a shipped chat feature that any group depends on is not on the table.
