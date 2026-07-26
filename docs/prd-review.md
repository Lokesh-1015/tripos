# TripOS — Architecture & PRD Review

**Reviewer:** Lead architect
**Date:** 2026-07-26
**Reviewing:** `prd.md` v0.1 Draft
**Status:** Architecture and roadmap agreed — see §9. Ready to begin M0.

---

## 0. Executive Summary

The product thinking in this PRD is above average. The problem is real, the wedge ("we solve coordination, not reservations") is sharp, the AI stance ("enhancement, never a dependency") is mature, and the module decomposition maps cleanly onto genuine bounded contexts. I would not change the vision.

The engineering plan is where I'd push back, in four places:

| #   | Issue                                                                                                                                                    | Severity                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | **Next.js App Router + Module Federation is not a supported combination.** The PRD mandates both.                                                        | 🔴 Blocking — must be resolved before scaffolding |
| 2   | **14 deployable units (6 MFEs + 8 services) before the first user.** Cost is paid immediately, benefit arrives at ~20 engineers.                         | 🔴 Highest project risk                           |
| 3   | **The authorization model is entirely unspecified**, yet it is the single most cross-cutting concern in the product (every feature lives inside a trip). | 🔴 Will cause rework in every module              |
| 4   | **The "MVP" in §23 is a 1.0.** Eleven capabilities including chat, a document vault, and settlement optimization.                                        | 🔴 Ship risk                                      |

My core recommendation is a **modular monolith on both tiers, with the microservice/MFE boundaries drawn and mechanically enforced from day one**, so extraction later is a deployment change rather than a rewrite. This is not a downgrade of the architecture — it is the same architecture, with the network hops deferred until they buy something.

> **All four issues above are now resolved. See §9 for the decisions taken and §7 for the agreed roadmap.** Issues 1–3 are addressed as recommended; issue 4 is addressed by incremental delivery across M1–M6 rather than by cutting §23's feature list — chat stays in MVP by explicit decision (§4.10).

Everything below is detail supporting that.

---

## 1. What the PRD Gets Right

Worth stating explicitly, because the rest of this document is critique:

- **§2 Living Document notice.** Rare and correct. It gives us licence to improve, and I'll use it.
- **§4 / §8 positioning.** "TripOS exists to solve coordination rather than reservations" is the best line in the document. It rules things out, which is what a good positioning statement does.
- **§11 AI Philosophy.** Correct and unusually disciplined. AI as an optional enhancement layer, core flows functional without it. Keep this.
- **§7 web-first, no native for MVP.** Right call. Group travel coordination is link-shared; the web has zero install friction, which matters enormously for the invite flow (see §4.8 below).
- **Domain decomposition (§9, §14).** Trip / Expense / Media / Notification / Chat are genuine bounded contexts with different consistency, scaling, and data-sensitivity profiles. This decomposition is good and I intend to preserve it as module boundaries.
- **Stack choices.** Next.js, NestJS, PostgreSQL, Prisma, Redis, BullMQ, R2, Nx, pnpm are all defensible, mainstream, well-documented, and hireable-for. No exotic bets. (Detailed stack assessment in §6.)
- **§16 acknowledging a shared database is acceptable initially.** Pragmatic. Though it contradicts §12–14; see §3.2.

---

## 2. The Blocking Technical Issue: App Router + Module Federation

This needs resolving before a single folder is created, because it determines the shape of the entire frontend.

**The requirement (PRD line ~830):** _"Use Next.js (App Router) + TypeScript … Enable module federation or equivalent MFE strategy."_

**The problem:** these are mutually exclusive today.

- `@module-federation/nextjs-mf` — the only real Next.js federation plugin — supports the **Pages Router only**. Its documentation states App Router is unsupported.
- This isn't a missing feature, it's structural. React Server Components resolve their module graph **on the server** and stream results over the Flight protocol. Runtime module federation assumes a **client-side** resolvable graph. RSC + runtime federation are architecturally opposed.
- Turbopack (default in recent Next versions) has no Module Federation support at all.
- Nx's `module-federation` generators target React on webpack/rspack, not Next.js App Router. _(Verify against the current Nx version before relying on this.)_

So there are exactly three honest paths:

| Option                                                                    | What you get                                                                                                                                                   | What you give up                                                                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Next.js App Router, single app, feature libraries**                  | RSC, streaming, Server Actions, best-in-class Next DX, one build, one deploy, trivial shared auth                                                              | Independent deploy cadence per module (which you don't need yet)                                                                      |
| **B. Next.js Pages Router + Module Federation**                           | True runtime federation, independent deploys                                                                                                                   | Abandon RSC/App Router permanently; `nextjs-mf` is thinly maintained; Pages Router is legacy; SSR + federation is notoriously fragile |
| **C. Next.js Multi-Zones (App Router)**                                   | Officially supported "MFE": each zone is an independent Next app with its own `basePath`, stitched by rewrites from the shell. Independent builds and deploys. | Full page load when crossing zones (no shared SPA shell); duplicated framework bundles; cross-zone auth cookie config                 |
| **D. Drop Next for the app shell** — Vite/rsbuild + React Router + MF 2.0 | Cleanest true-MFE story that exists                                                                                                                            | Lose SSR/SEO/Next ecosystem; marketing site becomes a separate app anyway                                                             |

**My recommendation: A now, with C as the pre-designed escape hatch.**

Build one Next.js App Router application. Structure every feature as an Nx library under a domain folder. Enforce isolation with Nx tags and `@nx/enforce-module-boundaries` in ESLint — so a `trips` library _cannot_ import from `expenses` except through a published contract, and CI fails if it tries. That gives you the actual valuable properties of MFE:

- enforced module isolation ✅
- independent codebases with clear ownership ✅
- parallel/incremental builds (`nx affected`) ✅
- ability to reason about one domain without loading the others ✅

What it doesn't give you is independent _deployment_. And you should ask honestly: with one developer, what does independently deploying the expenses UI buy you? Nothing. It costs you: six Vercel projects, six build pipelines, shared-dependency version skew, cross-app auth session plumbing, duplicated React/Next bundles downloaded by users, and a debugging story where a runtime type mismatch between host and remote surfaces as a white screen in production.

When you genuinely need independent deploys — a second team owning expenses, a different release cadence — a `libs/expenses/*` tree lifts out into a Multi-Zone app with a `basePath` in days, precisely _because_ the boundary was enforced all along. **The boundary is the valuable thing. The network hop is the cost.** Take the boundary now, defer the cost.

**Also note:** MFE and the PRD's "SEO-friendly" requirement (§21) work against each other. Federated remotes are hostile to SSR and prerendering. See §3.4.

---

## 3. Internal Inconsistencies

Listed most-consequential first. Each needs a resolution recorded in the PRD.

### 3.1 Clerk vs. `auth-service` and `user-service`

§17 names Clerk as the preferred auth provider. §14 lists **Authentication Service** and **User Service** as separate microservices. If you use Clerk, an auth service is redundant — Clerk _is_ the auth service. Building a NestJS auth-service alongside Clerk means two identity stores and a synchronisation bug factory.

**Resolution:** Clerk owns authentication (credentials, sessions, MFA, social, magic links). Your backend owns a local `User` row synced via Clerk webhook, and owns **authorization** entirely. Delete `auth-service`; fold user profile into the core API. See §5.2 for the identity boundary.

### 3.2 Microservices (§12–14) vs. shared database (§16)

Independent services sharing one database is a _distributed monolith_ — the worst of both worlds: you pay network latency, deployment coordination, and partial-failure handling, while retaining full coupling through the schema. It also breaks concretely with Prisma: either every service redeclares the same models (drift), or they share one `schema.prisma` (coupling, which negates the split).

The PRD is being pragmatic in §16 and I agree with the pragmatism — but the honest conclusion of that pragmatism is a modular monolith, not microservices.

**Resolution:** one Postgres, one Prisma schema in a shared `database` library, one API application with strictly separated Nest modules. Module-to-module communication only via published interfaces and an in-process domain event bus (behind an interface, so it swaps for NATS/Redis Streams on extraction).

### 3.3 Vercel + Socket.IO

§17 deploys the frontend to Vercel and mandates Socket.IO for realtime. Vercel's serverless/edge runtime cannot host a long-lived WebSocket server. Realtime must live on the persistent-container side (Railway/Render) or a hosted provider.

**Resolution:** WebSocket gateway lives in the API app on Railway/Render, with the Socket.IO Redis adapter configured from day one (single-node without it becomes a rewrite the moment you scale to two instances). Also evaluate whether realtime is needed at all before Phase 3 — see §7 M6.

### 3.4 "SEO-friendly" for an authenticated workspace

There is almost nothing to index. Trips are private. The only SEO surface is marketing/landing pages, plus (later) public trip templates and shared trip replays.

**Resolution:** treat the marketing site as a separate concern (separate route group with static rendering, or a separate lightweight app later). Drop SEO as a requirement on the application itself; it currently justifies architecture choices (SSR everywhere) that cost you without benefit.

### 3.5 `apps/auth` as a micro frontend

Authentication is a shell/global concern — session state, redirect handling, route protection. Splitting it into its own deployable creates cross-origin session handling, redirect loops, and a full page load on the most conversion-sensitive screen in the product, for zero benefit. With Clerk it's approximately two components and a middleware file.

**Resolution:** authentication lives in the shell/root of the web app.

### 3.6 `apps/admin` on day one

Listed as a scaffold target with **no requirements anywhere in the PRD** — no admin user stories, no roles, no defined capabilities. Scaffolding it produces an empty deployable that must nonetheless be maintained, secured, and CI'd.

**Resolution:** defer. When you need admin capability, the first version is a protected route group in the main app. Note that an admin tool that can read user trips (containing passport scans) is a serious security surface deserving its own design pass, not a day-one scaffold.

### 3.7 "Not a booking platform" (§3) vs. hotel/restaurant voting (§9)

Not a true contradiction, but under-specified. Does TripOS store a _reference_ to a hotel (name, link, price estimate, confirmation PDF) or does it integrate booking APIs? The former is consistent with the vision; the latter is a different company.

**Resolution:** TripOS stores references and confirmations. No inventory, no availability, no payments. If affiliate revenue becomes the model later, that's an outbound link, not an integration. Worth stating in the PRD because it constrains the data model.

### 3.8 §2 "propose better approaches" vs. the appended instruction "Do not simplify or collapse folders"

The PRD's final line forbids exactly the kind of improvement its §2 invites, and directly conflicts with your standing instruction to me ("never blindly implement requirements if there is a significantly better engineering approach"). I cannot satisfy both. This is the primary decision in §9.

### 3.9 Offline support, stated casually

§7 and §9 ask for PWA installability and offline access to documents. §21 lists "offline-capable for selected features." For authenticated, user-specific, mutable data this means: a service worker, an IndexedDB cache layer, a background sync/outbox queue, and an explicit **conflict resolution policy**. That is weeks of work and a permanent tax on every feature that participates. It is currently three bullet points.

**Resolution:** scope offline precisely — read-only cached access to the current trip's itinerary and documents, plus installability. No offline writes in v1. Revisit after real usage data.

### 3.10 §23 MVP scope

Eleven capabilities: auth, trips, invites, voting, itinerary, tasks, expenses with settlement, documents, packing, chat, archive. Realistically 6–9 months solo at production quality. An MVP that takes 9 months isn't minimum and isn't viable — you'll get zero user feedback for three quarters. See §7 for a phased cut.

---

## 4. Missing Requirements

These are gaps, not disagreements. Ordered by how expensive they are to retrofit.

### 4.1 🔴 Authorization model — the biggest omission

§9 says "Member roles." That's the entire specification. Yet **every feature in the product is scoped to a trip and gated on membership + role.** Unspecified:

- Role set and semantics. I'd propose `OWNER` / `ADMIN` / `MEMBER` / `VIEWER`.
- Per-action rules: who edits the itinerary? who deletes _someone else's_ expense? who removes a member? who can see the document vault (passports!)? who closes a poll? who exports data?
- What happens when the OWNER leaves a trip. (Transfer? Block? Auto-promote oldest admin?)
- Whether a removed member's historical contributions (expenses, messages, photos) persist. They must, for ledger integrity — but then what's visible?
- Viewer/read-only sharing (e.g. a parent who funds the trip but doesn't participate).

This is also the strongest single argument against microservices right now: with 8 services, _every one_ must answer "is this user a member of trip X with role Y" — meaning either an RPC to trip-service on every request, or replicated membership data. In one application it's one guard.

**Proposal:** `TripMembership { tripId, userId, role, status, joinedAt }` as the authorization root. A single `TripAccessGuard` + `@RequiresTripRole(...)` decorator resolving `tripId` from params/body/query. Explicit policy functions in a `shared/authz` library (`canDeleteExpense(actor, expense)`) rather than scattered `if` statements — testable in isolation, and the natural place to add Postgres RLS later as defence in depth. Repository layer always takes `tripId` so an unscoped query is impossible to write by accident.

### 4.2 🔴 Money model

Not specified at all, and the most trust-critical part of the product. Non-negotiables:

- **Never floats.** Integer minor units (`amountMinor: Int`) + ISO-4217 `currency`, or Prisma `Decimal`. I recommend integer minor units.
- **Multi-currency from the schema on day one.** Group travel is inherently cross-border; retrofitting currency into a money model is one of the ugliest migrations there is. UI can be single-currency initially; the schema cannot.
- **FX snapshot at write time.** Store `fxRateToTripBase` and the derived `baseAmountMinor` on each entry. Rates change; historical totals must not.
- **Append-only ledger; balances derived, never stored mutable.** `LedgerEntry { tripId, userId, currency, amountMinor (signed), kind, sourceType, sourceId, createdAt }`. Balance = `SUM(ledger)` per `(trip, user, currency)`, cached in Redis with explicit invalidation. Corrections are **reversing entries**, not `UPDATE`s. This gives you an auditable history, trivially correct undo, and no drift — the properties users need to trust the numbers.
- **Settlements are recorded transfers**, not a UI state. Support partial payments and "marked as paid outside the app."
- **Rounding policy must be explicit.** ₹100 split three ways. Who absorbs the extra paisa? Deterministic largest-remainder, and the sum of shares must always equal the total — assert it in code.
- **Guest participants.** "Raj isn't on the app but owes ₹400" is an extremely common real case (Splitwise supports it). Needs a `TripParticipant` concept decoupled from `User`, plus a claim flow when Raj signs up later. **This is a data-model decision that is very hard to retrofit** — decide now even if the UI ships later.
- **Idempotency keys** on expense creation. Mobile networks + retries + money = duplicate charges.

### 4.3 🔴 Sensitive data handling

§9 lists "Passports" and "Insurance" in the document vault, and §9 includes live location sharing. This is the highest-risk data in the product and gets four words of treatment ("Privacy-first implementation").

Required before those features ship:

- **Data classification and PII inventory.** Which tables/buckets hold what, retention per class.
- **Documents:** private bucket, short-TTL signed URLs (never public URLs), server-side access checks on every issuance, per-access audit log, malware scanning on upload, explicit deletion semantics (hard-delete from R2, not just a DB flag).
- **EXIF stripping on all image uploads.** Photos carry GPS coordinates and timestamps. Uploading holiday photos to a shared gallery currently leaks precise home/hotel locations to everyone in the trip. Strip on ingest.
- **Live location:** per-session explicit opt-in, hard auto-expiry (e.g. 8h max), no historical trail retained by default, persistent visible indicator while active, one-tap kill switch, and never included in exports.
- **Offline document caching directly conflicts with security** — a cached passport scan in browser storage on a shared laptop. Decide deliberately; I'd exclude the vault from offline caching in v1.
- **Legal:** India's DPDP Act 2023 and GDPR both apply to this data. Needs ToS, privacy policy, subprocessor list, data export, and account deletion (§4.9). Age gate — the stated audience starts at 18, so state and enforce 18+ (or 16+) at signup.

### 4.4 🟠 Cross-cutting primitives the PRD treats as separate features

This is the largest available reduction in code volume. §9 lists five voting features (destination, date, activity, restaurant, hotel). They are **one Poll primitive** with a subject type and an options collection. Likewise:

| Primitive                            | Reused by                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `Poll` + `PollOption` + `Vote`       | destination, dates, activities, restaurants, hotels — and anything future |
| `Comment` (polymorphic subject)      | itinerary items, expenses, documents, photos, polls, tasks                |
| `Attachment`                         | itinerary items, expenses (receipts), messages, trips, tasks              |
| `Activity` / audit event             | activity feed, notifications, trip replay, "who changed this"             |
| `Notification` + delivery preference | tasks, polls closing, expenses, mentions, invites                         |
| `Checklist` + `ChecklistItem`        | packing lists, tasks/responsibilities, pre-trip readiness                 |

Build these six primitives well and roughly half of §9 becomes configuration. Build them as fifteen features and you'll have fifteen half-correct implementations of comments.

**Also:** _Trip Replay_ (§9) is not a module — it's a **read model derived entirely from data you already have** (itinerary + expenses + photos + locations + activity log). It should be a projection/query, not a feature with its own storage. That reframing makes it nearly free, which is good, because it's your best organic-sharing loop.

### 4.5 🟠 Trip lifecycle states

Undefined, yet it gates behaviour everywhere. Proposed: `DRAFT → PLANNING → ACTIVE → COMPLETED → ARCHIVED`. Determines when voting closes, when live location is permitted, when Trip Replay generates, what's editable, what notifications fire, and what the dashboard shows. Needs to be in the PRD and in the schema.

### 4.6 🟠 Invitation flow

"Invite members" is one bullet. Unspecified: invite by email vs. shareable link vs. both; token expiry and single-vs-multi-use; whether the invitee must have an account before or after accepting; what a joiner sees of history predating them; approval by admin; revoking a pending invite; rate limits (an unbounded invite endpoint is a spam vector).

This flow is **existentially important** — see §4.8 — and deserves more design attention than any other screen in the product.

### 4.7 🟠 Time and timezones

Trips cross timezones; that's the point of trips. Store instants in UTC with an explicit IANA timezone on the trip (and per itinerary item where it differs), render in trip-local by default. All-day items are dates, not instants, and must not be timezone-shifted. Getting this wrong shows up as itineraries silently sliding by a day, and it's a data migration to fix.

### 4.8 🟠 The multiplayer cold-start problem

This is a product risk with architectural consequences, and the PRD never names it. **A TripOS trip with one member has negative value** — it's worse than a Google Sheet. Value is strictly a function of how many group members actually join. Therefore:

- Every metric in §22 (MAU, retention, trip creation) is misleading in isolation. The metric that matters is **invite acceptance rate**, and **% of trips reaching ≥3 active members**. Those should be the North Star inputs.
- Architecturally: the invited-user path must work with **zero friction and zero install** — link opens, content is visible (read-only preview before signup is worth considering), signup is one tap. This is a strong argument for web-first (already correct in §7) and against splitting auth into its own deployable (§3.5), and against anything that adds a redirect to that path.

### 4.9 🟠 Data export and account deletion

Absent. Legally required under GDPR/DPDP, and non-trivial here because a user's data is entangled with other people's trips — you cannot delete someone's expense entries without corrupting the group's ledger. Needs a designed policy: anonymise the user, preserve ledger integrity, hard-delete their uploads and personal documents. Decide before you have users, not after a deletion request arrives.

### 4.10 🟠 Chat — **confirmed in MVP**; specification required

I originally recommended cutting chat from MVP. That was overruled, and the decision is recorded in §9. Chat is in. The concern I raised is preserved below for the record, and then discharged — because if chat ships, the mitigation is to make it _good enough that groups actually move_, and that requires specifying it.

**The concern, for the record:** you are competing with WhatsApp for a group's conversation, and partial adoption is worse than none — half the discussion here and half there makes coordination _more_ fragmented, the exact problem §4 exists to solve. The mitigation is not to build a worse WhatsApp; it is to make TripOS chat do the one thing WhatsApp cannot: **anchor messages to trip objects**. A message that references a poll, an expense, or an itinerary item — and can be promoted into one — is a reason to switch. Generic messaging is not. Build chat around that hook, and ship contextual comments alongside it (both reuse the same primitives), so a decision is never lost in the scroll regardless of where the discussion happened.

**Consequences of this decision, accepted:**

- Realtime is no longer deferrable. Socket.IO + the Redis adapter move from "evaluate at M6" to a hard M6 requirement, and the API must run on a persistent container (already the plan — §5.1).
- Transactional email and web push become hard requirements, not nice-to-haves — an unread message nobody is notified about is worse than no chat.
- M6 grows from ~2 weeks to ~3–4 weeks. Reflected in §7.

**What must be specified before M6 (currently six bullets in §9):**

_Data model_

- One `Conversation` per trip in v1 (no threads, no DMs — both are scope traps; revisit on evidence).
- `Message { id, tripId, authorId, kind, body, replyToId, clientMessageId, editedAt, deletedAt, createdAt }` where `kind ∈ TEXT | IMAGE | FILE | LOCATION | POLL_REF | EXPENSE_REF | SYSTEM`.
- **`clientMessageId` is not optional.** It gives you idempotent retries on flaky mobile networks _and_ the reconciliation key for optimistic UI. Retrofitting it means a migration plus reworking the send path.
- Append-only. Edits and deletes are tombstones (`editedAt` / `deletedAt`), never destructive — you need this for moderation and dispute resolution.
- Attachments, locations, and polls are **references to the existing primitives** (§4.4), not chat-specific implementations. Chat gets polls for free from the `Poll` primitive; media goes through the same upload pipeline with the same EXIF stripping (§4.3).

_Read state and delivery_

- Per-member `lastReadMessageId`; unread counts derived. **Not** per-message read receipts — that's an N×M table that grows with group size × message count and buys little.
- Cursor pagination on `(createdAt, id)`. Never offset — offset pagination in an append-heavy table produces duplicate and skipped rows as new messages arrive.
- Optimistic send → server ack → local retry queue.

_Transport_

- Socket.IO room per trip, Redis adapter from the first commit (single-node without it is a rewrite the moment you run two instances).
- Handshake authenticated via Clerk token; **membership and role verified on room join**, not trusted from the client. This is the same `TripAccessGuard` from §4.1 — one more reason that layer is load-bearing.
- Reconnect with backfill from the client's last-known message id.

_Cross-cutting_

- Mentions emit through the `Notification` primitive → web push + email fallback via `worker`.
- Pinned messages: separate table, admin-gated.
- Moderation and abuse: max message length, per-user rate limit, report-a-message, malware scan on file uploads.
- **What a late joiner sees:** I recommend full history — this is a shared trip workspace, not a private DM — but it must be an explicit, stated product decision, because it's a privacy expectation people have strong instincts about.
- Retention: messages live for the trip's lifetime and are deleted with it; interacts with §4.9 account deletion (anonymise the author, keep the message, or tombstone both — decide).

**Explicitly deferred within chat** (keeps the module tractable without weakening it): typing indicators, read receipts, threads, DMs, voice notes, message search. Message search arrives cheaply later via Postgres FTS.

### 4.11 🟡 Concurrency and conflict handling

Multiple people editing a shared itinerary simultaneously is the stated core use case, and drag-and-drop reordering is the worst possible case for naive last-write-wins (two users reorder; one silently loses their change). Needs an explicit strategy: optimistic concurrency with row versions and a 409 + merge UI, plus **fractional/lexicographic ordering keys** rather than integer positions (so reorders don't rewrite every sibling row). CRDTs are overkill here. Decide now — this leaks into the schema.

### 4.12 🟡 Testing strategy

Completely absent from the PRD. Required: unit tests for domain logic (the split/settlement math must be property-tested — it's the part users will notice being wrong), integration tests for API modules against a **real Postgres** (Testcontainers, not mocks — Prisma behaviour against a mock proves nothing), Playwright E2E for the critical paths (signup → create trip → invite → accept → add expense → settle), `axe` accessibility checks in CI. Plus a stated policy on what _must_ be tested, so it doesn't erode.

### 4.13 🟡 Observability

Sentry is listed; that's error tracking only. Missing: structured JSON logging with correlation/request IDs propagated end to end, distinct `/health` (liveness) and `/ready` (dependency) endpoints, uptime monitoring with alerting, slow-query logging, and BullMQ queue depth/failure metrics. If you _do_ go distributed, add OpenTelemetry tracing — non-optional at that point, because without it debugging a cross-service request is guesswork.

### 4.14 🟡 Other gaps

- **Rate limiting / abuse protection** on auth, invites, uploads, and AI endpoints. Not mentioned.
- **Upload constraints**: max file size, allowed MIME types (validated by content, not extension), per-trip and per-plan storage quotas. Video transcoding is expensive — I'd defer video entirely.
- **Search.** Not mentioned, but users will want to find a document or a message. Postgres full-text search covers you well past MVP; just don't design a schema that makes it hard.
- **i18n.** Even if English-only at launch, wire `next-intl` from day one and never hardcode a user-facing string. Cheap now, a full-codebase refactor later.
- **Secrets management.** Not mentioned. `.env.example` committed, real secrets in the platform's secret store, never in the repo, rotation policy for the Clerk/Mapbox/R2 keys.
- **Backup and DR.** No RPO/RTO stated. For a product holding financial records and passport scans: automated daily backups, point-in-time recovery, and a _tested_ restore. An untested backup is not a backup.
- **Performance budgets.** "Fast" (§21) isn't a requirement. Make it measurable: LCP < 2.5s on mid-tier Android over 4G, API p95 < 300ms, per-route JS budget enforced in CI.
- **Accessibility target.** "Accessible" (§21) isn't testable. Set WCAG 2.2 AA and enforce what's automatable.
- **Analytics consent.** PostHog + EU visitors requires consent gating before any tracking fires.
- **§22 metrics have no targets or baselines**, and no activation definition. "Time spent planning" is also directionally ambiguous — you want it _down_, but engagement metrics usually reward _up_. State the direction.

---

## 5. Recommended Architecture

Same domains as the PRD. Different deployment topology, with the seams pre-cut.

### 5.1 Topology

```
Deployables (MVP):
  web       → Next.js App Router          → Vercel
  api       → NestJS (modular monolith)   → Railway/Render (persistent container)
  worker    → NestJS + BullMQ consumers   → Railway/Render
  postgres, redis, R2                     → managed
```

Four things to operate instead of fourteen. `worker` is separate from day one because background jobs (email, image processing, notification fan-out, digest generation) have a genuinely different scaling and failure profile from request handling — that split earns its keep immediately.

### 5.2 Identity boundary (mitigating Clerk lock-in)

Clerk owns credentials and sessions. Your database owns everything else:

- Local `User { id (internal cuid), clerkUserId (unique), email, displayName, avatarUrl, ... }`, kept in sync by a verified Clerk webhook (signature-checked, idempotent, with a reconciliation job for missed events).
- **Every domain table references the internal `User.id`, never `clerkUserId`.** This is the whole trick: swapping identity providers becomes re-mapping one column instead of migrating the entire schema.
- **Do not model trips as Clerk Organizations.** It's a tempting shortcut. Trips are numerous, ephemeral, and have travel-specific role semantics; organizations are billing-scoped and long-lived. Membership and roles live in your `TripMembership` table. This one is a trap worth naming explicitly.

### 5.3 Backend module structure

Each domain is a set of Nx libraries with enforced layering:

```
libs/api/trips/
  domain/          — entities, value objects, pure business rules. Zero I/O, zero Prisma, zero Nest.
  application/     — use cases, ports (interfaces), orchestration
  infrastructure/  — Prisma repositories, external adapters (implements ports)
  feature/         — Nest module, controllers, DTOs, guards
```

Dependency rule enforced by `@nx/enforce-module-boundaries`: `feature → application → domain`, `infrastructure → domain`. Domain never imports outward. That's Clean Architecture with a linter actually enforcing it, which is the only version that survives contact with a deadline.

Cross-module communication: **only** via published application-layer interfaces or the domain event bus. No module imports another module's `infrastructure` or `domain` — CI fails. In-process `EventEmitter2` behind an `EventBus` port for MVP; swap the adapter for NATS/Redis Streams on extraction, and the domain code doesn't change.

Anti-corruption note: the ledger (§4.2) is the one place I'd be strict about purity. All money math lives in `libs/api/expenses/domain` as pure functions, fully unit- and property-tested, with no framework or database dependency. It's the highest-consequence code in the product; it should be the easiest to test.

### 5.4 The contract layer — the highest-leverage decision after §2

The #1 source of bugs in Next + Nest monorepos is DTO drift between frontend and backend. Solve it structurally:

**Zod as the single source of truth**, in `packages/contracts`. From one schema, derive: TypeScript types (`z.infer`), NestJS validation pipes (`nestjs-zod`), and the typed frontend client. One definition, no codegen step, no drift possible.

For the transport, I recommend **`ts-rest`**: contract-first REST, a fully typed client from the same Zod contract, and it emits OpenAPI for free (useful for future native apps and any third-party consumer). tRPC has better DX but couples clients to TypeScript, which forecloses the native/public-API path the PRD explicitly wants to keep open (§7). ts-rest keeps REST — satisfying §15 — while giving you tRPC-grade type safety.

### 5.5 Proposed structure (vs. PRD §19)

```
tripos/
├── apps/
│   ├── web/                  # Next.js App Router — the single frontend
│   ├── api/                  # NestJS — modular monolith
│   ├── worker/               # BullMQ consumers
│   ├── web-e2e/              # Playwright
│   └── api-e2e/
│
├── libs/
│   ├── api/                          # backend domain modules
│   │   ├── trips/{domain,application,infrastructure,feature}
│   │   ├── expenses/{...}
│   │   ├── itinerary/{...}
│   │   ├── media/{...}
│   │   ├── notifications/{...}
│   │   ├── polls/{...}            # the shared Poll primitive (§4.4)
│   │   └── shared/{authz,events,errors,pagination,testing}
│   │
│   ├── web/                          # frontend feature modules
│   │   ├── trips/{feature,ui,data-access}
│   │   ├── expenses/{feature,ui,data-access}
│   │   └── shell/{layout,navigation,providers}
│   │
│   └── shared/
│       ├── ui/                    # design system: Tailwind + shadcn + tokens
│       ├── contracts/             # Zod schemas → types → DTOs → client  ⭐
│       ├── database/              # Prisma schema, client, migrations, seed  ⭐
│       ├── config/                # typed env validation, feature flags
│       └── utils/
│
├── docker/                        # docker-compose: postgres, redis, mailhog
├── infrastructure/                # IaC (later — placeholder is fine)
├── docs/                          # ADRs, architecture, domain model, runbook
├── scripts/
├── CLAUDE.md
└── nx.json / tsconfig.base.json / .env.example
```

Changes from PRD §19 and why:

| Change                                                                       | Rationale                                                                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/{shell,auth,trips,expenses,profile,admin}` → `apps/web` + `libs/web/*` | §2 — MF/App Router incompatibility; boundaries preserved as libraries                                                     |
| 8 `services/*` → `apps/api` + `libs/api/*`                                   | §3.2 — same boundaries, no distributed monolith                                                                           |
| `packages/` → `libs/`                                                        | Nx convention; `packages/` implies publishable, these aren't                                                              |
| **+ `libs/shared/database`**                                                 | Prisma must have exactly one owner. Missing from the PRD, and its absence is what makes the shared-DB question ambiguous. |
| `packages/types` → `libs/shared/contracts`                                   | §5.4 — runtime-validated Zod contracts strictly dominate hand-written types                                               |
| `packages/sdk` → generated from contracts                                    | Hand-written API clients drift; derived ones can't                                                                        |
| **+ `libs/api/shared/authz`**                                                | §4.1 — the missing cross-cutting concern needs a home                                                                     |
| **+ `apps/*-e2e`, `libs/api/shared/testing`**                                | §4.12 — the PRD has no testing story                                                                                      |
| `apps/admin` deferred                                                        | §3.6 — no requirements exist for it                                                                                       |
| Dropped `worker` omission                                                    | Background jobs need a real home, not an afterthought in `api`                                                            |

### 5.6 Local development

Docker Compose for **infrastructure only** — Postgres, Redis, Mailhog. Run `web` and `api` on the host via `nx run-many`. Dockerising the Next dev server destroys hot-reload speed on Windows/OneDrive bind mounts; you'd be trading the most-used feedback loop in your day for a purity you don't need.

⚠️ **A note on your working directory:** this project sits in `OneDrive\Desktop\TripOS`. OneDrive continuously syncing `node_modules`, `.next`, and `.nx/cache` will be slow, will cause file-lock errors during installs and builds, and can corrupt caches. **Move the repo outside OneDrive** (e.g. `C:\dev\tripos`) before we start. This will bite you otherwise.

---

## 6. Tech Stack Assessment

| Choice               | Verdict                | Notes                                                                                                                                                                                                                                                                                                       |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nx + pnpm            | ✅ Keep                | Generators, `affected`, and module-boundary enforcement are exactly what this project needs. Nx over Turborepo specifically _because_ of boundary enforcement. Add Nx Cloud remote caching when CI time hurts.                                                                                              |
| TypeScript strict    | ✅ Keep                | Go further: `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`. Add these on day one; adding them later is a thousand-error refactor.                                                                                                                            |
| Next.js App Router   | ✅ Keep                | But not with Module Federation (§2).                                                                                                                                                                                                                                                                        |
| NestJS               | ✅ Keep                | Good fit for DDD layering; DI makes the ports/adapters pattern natural.                                                                                                                                                                                                                                     |
| PostgreSQL + Prisma  | ✅ Keep                | Note Prisma's weaknesses for complex aggregate queries (balances, replay stats) — plan to drop to raw SQL via `$queryRaw` for those, typed with Zod. That's normal and fine.                                                                                                                                |
| Redis + BullMQ       | ✅ Keep                | Also your Socket.IO adapter and balance cache.                                                                                                                                                                                                                                                              |
| Cloudflare R2        | ✅ Keep                | S3-compatible, no egress fees — materially better than S3 for a photo-heavy product.                                                                                                                                                                                                                        |
| Clerk                | ✅ Keep for MVP        | Auth is the least differentiating and most security-sensitive area; buying it is correct. Mitigate lock-in per §5.2. Verify current pricing and data-residency terms for your user base.                                                                                                                    |
| Tailwind + shadcn/ui | ✅ Keep                | Copy-in, not a dependency — right for a design system you'll customise.                                                                                                                                                                                                                                     |
| Sentry, PostHog      | ✅ Keep                | Add structured logging + uptime monitoring (§4.13).                                                                                                                                                                                                                                                         |
| GitHub Actions       | ✅ Keep                | `nx affected` for lint/typecheck/test/build; migrations gated on review.                                                                                                                                                                                                                                    |
| Framer Motion        | 🟡 Use sparingly       | Easy to over-apply and regress mobile performance. Prefer CSS transitions; reach for it only for genuinely motion-dependent UI (Trip Replay).                                                                                                                                                               |
| Socket.IO            | ✅ Keep — now required | Chat in MVP (§9) makes realtime non-optional at M6. It cannot live on Vercel (§3.3), so it runs in `api` on Railway/Render, and the Redis adapter goes in from the first commit. M1–M5 still use SWR revalidation + optimistic UI; don't reach for sockets before M6.                                       |
| **Mapbox GL JS**     | 🟠 Reconsider          | v2+ is under a proprietary licence requiring Mapbox services, and map loads are metered — a photo/map-heavy trip app can generate surprising bills. **MapLibre GL JS** (the BSD fork) + a tile provider gives you provider portability and predictable cost. Worth an hour of evaluation before committing. |
| Module Federation    | 🔴 Drop for now        | §2.                                                                                                                                                                                                                                                                                                         |
| 8 microservices      | 🔴 Defer               | §3.2, §5.                                                                                                                                                                                                                                                                                                   |
| Railway/Render       | ✅ Keep for MVP        | Correct call — persistent containers, cheap, minimal ops. Don't touch Kubernetes until there's a reason.                                                                                                                                                                                                    |
| Supabase Postgres    | 🟡 Fine, but           | If you use Supabase _only_ as Postgres, that's fine. Don't half-adopt Supabase Auth/Storage/Realtime alongside Clerk and R2 — overlapping platforms is how monorepos get confusing. Pick one platform per concern.                                                                                          |

**Additions I'd recommend:** `zod` (contracts), `ts-rest` (typed API), `nestjs-zod`, `Vitest` (faster than Jest, better ESM), `Playwright`, `Testcontainers`, `next-intl`, `pino` (structured logs), `Resend` or similar for transactional email (nothing in the PRD sends email, yet invites and notifications require it — a real gap), and `changesets` only if you ever publish packages (you probably won't).

---

## 7. Recommended Roadmap

Reframed from the PRD's five phases into milestones that each end in something demonstrable. Estimates assume one experienced full-stack developer working steadily; treat them as relative sizing, not commitments.

**M0 — Foundation (~1 week)**
Nx workspace; `web` + `api` + `worker` + libs skeleton; strict TS; ESLint/Prettier; **module-boundary tags enforced in CI from commit one** (retrofitting them is the hard version); Prisma + Postgres/Redis via Compose; Clerk auth + user-sync webhook; `contracts` package with one end-to-end typed endpoint proving the pattern; design tokens + shadcn in `shared/ui`; CI running `nx affected` lint/typecheck/test/build; Sentry + structured logging; `/health` + `/ready`.
✅ _Done when:_ a user signs in, an empty dashboard renders from a typed API call, and CI is green.

**M1 — Trip Core (~1–2 weeks)**
Trip CRUD; lifecycle states (§4.5); `TripMembership` + roles + **the authorization layer built properly** (§4.1) — this is the load-bearing milestone; invite links with tokens, expiry, revocation; join flow; trip dashboard; mobile-first navigation shell; countdown.
✅ _Done when:_ you create a trip, send a link, and a friend on their phone joins it.

**M2 — Decide (~1–2 weeks)**
The generic `Poll` primitive (§4.4) covering destination/date/activity/restaurant/hotel; voting with change-your-vote; deadlines; closing a poll records a decision on the trip; the `Comment` primitive; the `Activity` feed. Five PRD features from one implementation.
✅ _Done when:_ a group settles a destination and dates without leaving the app.

**M3 — Money (~2–3 weeks)** ← _highest-value milestone; do not rush it_
Ledger model (§4.2); multi-currency + FX snapshots; equal/exact/share/percentage splits; guest participants; derived balances; minimum-cash-flow settlement suggestions; recorded settlements incl. partial; receipt attachments; property-tested split math; idempotency keys.
✅ _Done when:_ you reconstruct a real past trip's expenses and the numbers agree to the last paisa.

**M4 — Plan (~2 weeks)**
Itinerary days and items; fractional ordering keys (§4.11); optimistic concurrency; timezone handling (§4.7); notes, locations, attachments, comments (reusing M2 primitives).
✅ _Done when:_ three people edit an itinerary concurrently without silently losing changes.

**M5 — Logistics (~1–2 weeks)**
Tasks/responsibilities with due dates; packing lists (personal + shared) with templates — both on the `Checklist` primitive; document vault with signed URLs, EXIF stripping, and the §4.3 controls.
✅ _Done when:_ → **🎯 Dogfood gate: run one real trip end-to-end on TripOS.** Everything after this should be prioritised by what that trip taught you, not by this document.

**M6 — Communication & Presence (~3–4 weeks)** ← _largest milestone; chat is in scope per §9_
Notification model with channels and preferences (§4.14 — requires a transactional email provider, which the PRD stack currently lacks); digests via `worker`; web push. Then the realtime tier: Socket.IO with the Redis adapter, authenticated handshake, membership-verified room join. Then **group chat per the §4.10 specification** — message model with `clientMessageId`, cursor pagination, `lastReadMessageId` unread counts, attachments/locations/polls as references to existing primitives, mentions wired to notifications, pinned messages, moderation and rate limits. Typing indicators, read receipts, threads, DMs, and message search explicitly deferred.
✅ _Done when:_ a group holds a real conversation in TripOS on mobile, offline-sent messages reconcile on reconnect without duplicates, and a mention reaches someone who has the app closed.

**M7 — PWA & Offline (~1–2 weeks)**
Installability; read-only cached trip data; offline itinerary access. No offline writes (§3.9). Vault excluded from cache.

**M8+ — Experience**
Gallery (photos only; defer video); maps; live location (with §4.3 controls, gated behind an explicit design review); Trip Replay as a derived read model (§4.4) — this is your best organic growth loop, so give it real design attention when you get there.

**M9+ — Enhancements**
AI layer behind a feature flag and a provider-agnostic interface; admin; analytics; premium.

**Changes from the PRD's phasing, both agreed in §9:**

1. **Expenses move earlier** (PRD Phase 3 → M3). Highest-value, highest-trust, most structurally constraining module — Splitwise replacement is the strongest single reason to adopt TripOS. Building it after chat risks discovering ledger requirements that invalidate earlier schema decisions.
2. **Chat stays in MVP but moves to M6**, after the dogfood gate. This ordering matters: M5 puts a real trip through the product, so by the time chat is built you'll know from actual use which conversations groups have and what they need anchored to — which is precisely the information that determines whether TripOS chat is worth switching to (§4.10). Building it at M6 rather than M2 is what makes it likely to be good.

---

## 8. Documentation to Create

Immediately, alongside M0:

| Document                                  | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`CLAUDE.md`**                           | Repo conventions, commands, layering rules, module-boundary rules, naming, "always/never" list, where things go. This is what keeps AI-assisted output consistent across sessions — highest leverage doc in the repo. I'd write this first.                                                                                                                                                                                                                                                                                                    |
| **`docs/adr/`**                           | One ADR per decision made here: 0001 modular monolith over microservices, 0002 App Router over Module Federation, 0003 Clerk as identity provider, 0004 Zod + ts-rest contracts, 0005 ledger-based money model, 0006 authorization model, 0007 realtime strategy, 0008 chat in MVP (recording the trade-off, the accepted risk, and the anchoring mitigation). Each states context, options, decision, consequences, and **what would make us revisit it**. Six months from now this is the difference between an informed change and a guess. |
| **`docs/architecture.md`**                | C4-style context/container/component views as Mermaid diagrams (renders in GitHub, diffs as text).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **`docs/domain-model.md`**                | ERD + aggregate boundaries + invariants (especially the ledger invariants).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`docs/security.md`**                    | Threat model, PII inventory and data classification, secrets handling, incident basics. Gates the vault and live-location features.                                                                                                                                                                                                                                                                                                                                                                                                            |
| **`docs/testing.md`**                     | The pyramid, what must be tested, how to run each layer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **`docs/api/`**                           | OpenAPI generated from contracts — never hand-written.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **`docs/runbook.md`**                     | Deploy, migrate, roll back, restore from backup, rotate a secret, on-call basics. Write it before you need it at 2am.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **`CONTRIBUTING.md`**, **`.env.example`** | Onboarding. Assume a second developer joins in 6 months.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **`docs/prd-changelog.md`**               | Every PRD amendment, dated, with the reason. §2 promises a living document; this is the mechanism that makes it real rather than aspirational.                                                                                                                                                                                                                                                                                                                                                                                                 |

---

## 9. Decisions Made (2026-07-26)

| #   | Decision               | Outcome                                                                                                                                                                                                                                                                                    | ADR        |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | **Topology**           | **Modular monolith with enforced boundaries.** `apps/web` + `apps/api` + `apps/worker`; every PRD domain boundary preserved as Nx libraries with `@nx/enforce-module-boundaries` failing CI on violation. Module Federation dropped; Next Multi-Zones is the pre-designed extraction path. | 0001, 0002 |
| 2   | **Chat**               | **Full chat in MVP**, sequenced at M6. My recommendation to defer was overruled; specification and accepted consequences in §4.10. Realtime, transactional email, and web push are now hard requirements rather than optional. Contextual comments ship anyway at M2 (shared primitive).   | 0007, 0008 |
| 3   | **Auth**               | **Clerk.** `auth-service` deleted from the architecture as redundant (§3.1). Lock-in mitigated by internal `User.id` in every domain table (§5.2). Trips are **not** Clerk Organizations.                                                                                                  | 0003       |
| 4   | **Scope & sequencing** | **Milestone plan per §7 accepted**, with expenses moved ahead of chat and notifications. §23's MVP is delivered incrementally across M1–M6, with a dogfood gate at M5.                                                                                                                     | —          |

Everything else in this document proceeds as recommended unless flagged later.

**Open items I'll bring back with a recommendation rather than block on now:**

- Mapbox vs. MapLibre (§6) — needed by M8, not M0.
- Transactional email provider (§4.14) — needed by M6; I'll default to Resend at M0 and it's cheap to change.
- Late-joiner chat history visibility (§4.10) — product decision, needed by M6.
- Guest-participant claim flow UX (§4.2) — the _schema_ lands at M3; the UI can follow.

---

## 10. Risk Register

| #   | Risk                                                                                           | Impact   | Likelihood           | Mitigation                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------- | -------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | MVP scope (§23) is 1.0-sized; no user feedback for 6–9 months                                  | Critical | High                 | Milestone plan §7; dogfood gate at M5                                                                                                                                                                                                                                                                                                               |
| 2   | Module Federation + App Router dead end                                                        | High     | Certain if attempted | Resolve via §2 before scaffolding                                                                                                                                                                                                                                                                                                                   |
| 3   | Distributed complexity overwhelms a one-person team                                            | Critical | High                 | Modular monolith §5; extract on evidence                                                                                                                                                                                                                                                                                                            |
| 4   | Authorization model undefined → security holes + rework in every module                        | Critical | High                 | Build authz layer properly in M1 (§4.1)                                                                                                                                                                                                                                                                                                             |
| 5   | Money model wrong (floats, no currency, mutable balances)                                      | Critical | Medium               | Ledger + integer minor units + multi-currency schema on day one (§4.2)                                                                                                                                                                                                                                                                              |
| 6   | PII exposure — passports, live location, photo GPS                                             | Critical | Medium               | §4.3 controls; gate features on `docs/security.md`                                                                                                                                                                                                                                                                                                  |
| 7   | Multiplayer cold start — trips with 1 member have no value                                     | Critical | High                 | Optimise the invite path above all else; measure invite acceptance (§4.8)                                                                                                                                                                                                                                                                           |
| 8   | Chat built, groups stay on WhatsApp; adoption splits across both and coordination gets _worse_ | High     | High                 | **Accepted risk** — chat confirmed in MVP (§9). Mitigations: build it around trip-object anchoring rather than generic messaging, sequence at M6 so real dogfood data informs it, ship contextual comments alongside so decisions survive regardless of where discussion happens, and treat notification reliability as part of the feature (§4.10) |
| 9   | Vendor cost creep: Clerk + Mapbox + R2 + PostHog + Sentry + Vercel + Railway                   | Medium   | High                 | Free tiers for MVP; MapLibre over Mapbox; monthly cost review; keep providers behind interfaces                                                                                                                                                                                                                                                     |
| 10  | Clerk lock-in on identity                                                                      | Medium   | Medium               | Internal user IDs everywhere (§5.2); trips are not Clerk Orgs                                                                                                                                                                                                                                                                                       |
| 11  | Timezone / concurrent-edit issues discovered late                                              | High     | Medium               | Decide §4.7 and §4.11 at schema design, not at feature time                                                                                                                                                                                                                                                                                         |
| 12  | Offline support underestimated                                                                 | Medium   | High                 | Narrow scope explicitly (§3.9); defer to M7                                                                                                                                                                                                                                                                                                         |
| 13  | Repo inside OneDrive corrupts caches / slows builds                                            | Medium   | High                 | Move to `C:\dev\tripos` before M0 (§5.6)                                                                                                                                                                                                                                                                                                            |
| 14  | No transactional email provider chosen, yet invites and notifications require one              | Medium   | Certain              | Add Resend (or equivalent) to the stack in M0                                                                                                                                                                                                                                                                                                       |
| 15  | Untested backups                                                                               | High     | Medium               | Automated backups + a _rehearsed_ restore before launch (§4.14)                                                                                                                                                                                                                                                                                     |

---

## 11. Suggested PRD Amendments

Concrete edits, once §9 is settled:

- **§12–14, §19** — rewrite around the agreed topology; retain the domain decomposition as module boundaries, add the extraction criteria ("we split a module out when X").
- **New §: Roles & Permissions** — the full matrix (§4.1).
- **New §: Data & Money Model Principles** — ledger, currency, rounding, idempotency (§4.2).
- **New §: Privacy, Security & Compliance** — data classification, PII handling, retention, export/deletion, DPDP/GDPR (§4.3, §4.9).
- **New §: Core Primitives** — Poll, Comment, Attachment, Checklist, Activity, Notification; note that §9's five voting features and Trip Replay are expressions of these (§4.4).
- **§9** — add trip lifecycle states, invitation flow details, guest participants, timezone handling.
- **§15** — record that realtime lives on the persistent-container tier, not Vercel; note the Redis adapter requirement.
- **§17** — resolve Clerk vs. auth-service; resolve Mapbox vs. MapLibre; add transactional email.
- **§20** — replace with the §7 milestones, each with an explicit "done when."
- **§21** — replace adjectives with numbers: performance budgets, WCAG 2.2 AA, availability target.
- **§22** — add invite acceptance rate and % of trips with ≥3 active members as primary; define activation; state metric directions; add baselines/targets.
- **New §: Testing & Quality** (§4.12) and **New §: Observability** (§4.13).
- **§9 Group Chat** — replace the six bullets with the full specification from §4.10 (message model, read state, transport, moderation, retention, late-joiner visibility, and the explicitly deferred sub-features).
- **§23** — restate the MVP as the M1–M6 outcome, delivered incrementally. Feature list unchanged; chat retained.
- **Remove the appended scaffolding instructions** (lines ~770+) from the PRD. They're a task brief, not product requirements, and the "do not simplify or collapse folders" directive contradicts §2. Move to `docs/adr/` and `CLAUDE.md`.
