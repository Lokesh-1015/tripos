# ADR-0003: Clerk as identity provider

**Status:** Accepted
**Date:** 2026-07-26
**Deciders:** Product owner, lead architect

## Context

`prd.md` §17 names Clerk as preferred with Auth.js as the alternative, while §14 lists **Authentication Service** and **User Service** as separate microservices. These are contradictory: if Clerk is the identity provider, a bespoke auth service is redundant, and running both means two identity stores and a permanent synchronisation bug surface.

Authentication is simultaneously the least differentiating and most security-sensitive part of TripOS. Nobody will choose TripOS because of its session handling, but a single auth flaw is existential — particularly for a product that stores passport scans and financial records.

The MVP needs: email/password or magic link, social sign-in (Google at minimum, given the 18–40 audience), email verification, password reset, session management, and eventually MFA. All of it must work flawlessly on the invite-acceptance path, which is the product's most important flow.

## Options considered

**A. Clerk.** Managed. Social, magic links, MFA, and pre-built components out of the box. Excellent DX and Next.js middleware integration. Paid above the free tier, scaling with monthly active users. Introduces vendor dependency on identity.

**B. Auth.js (NextAuth).** Free, self-hosted, sessions and the user table are entirely ours. More to build and maintain, and we carry the full security burden on the highest-risk surface in the product. MFA and account-management UI are ours to build.

**C. Supabase Auth.** Sensible if the whole platform were Supabase. We already use Cloudflare R2 for storage (ADR pending) and would not use Supabase Realtime. Half-adopting a platform for one concern while using competitors for adjacent concerns is how architectures become confusing.

**D. Build it.** Rejected without serious consideration. Rolling bespoke credential storage and session management in 2026 is indefensible for a product holding this data.

## Decision

**Clerk (Option A)**, with a strictly enforced identity boundary and `auth-service` deleted from the architecture.

The boundary — this is the substance of the decision, not the vendor choice:

1. **Clerk owns authentication only**: credentials, sessions, MFA, social providers, email verification. Nothing else.
2. **We own authorization entirely** (ADR-0006). Clerk has no knowledge of trips or roles.
3. **A local `User` table is the canonical user record inside TripOS**: `{ id (internal cuid), clerkUserId (unique), email, displayName, avatarUrl, … }`, kept in sync by a signature-verified, idempotent Clerk webhook, with a reconciliation job for missed events.
4. **Every domain table references the internal `User.id`.** `clerkUserId` appears in exactly one column of one table. This is the whole trick: changing identity provider becomes re-mapping one column rather than migrating the entire schema.
5. **Trips are not Clerk Organizations.** This is a tempting shortcut and an explicit trap: trips are numerous, ephemeral, and carry travel-specific role semantics, whereas organizations are billing-scoped and long-lived. Membership and roles live in our `TripMembership` table.

`user-service` from PRD §14 becomes `libs/api/users/*` — profile data, preferences, and the Clerk sync adapter.

## Consequences

**Positive**

- Weeks of work avoided on the most security-sensitive, least differentiating surface.
- Social sign-in and magic links on day one, which materially reduce friction on the invite-acceptance path.
- MFA available without building it.
- Security patches for auth are someone else's full-time job.
- One less service, one less deployment (ADR-0001).

**Negative**

- Cost scales with monthly active users. Free tier covers MVP; verify current pricing and confirm it before any growth push. Add to the monthly cost review.
- Vendor dependency on identity — the highest-stakes category of lock-in. Mitigated by items 3–5 above, but not eliminated: migration would still mean a coordinated password-reset or re-authentication event for all users.
- An external dependency on the login path. Clerk downtime is TripOS downtime for unauthenticated users.
- Data residency is Clerk's to determine. Given India's DPDP Act obligations, confirm their residency and subprocessor terms before launch and record them in `docs/security.md`.
- Webhook sync is an eventual-consistency seam. It must be idempotent, signature-verified, and backed by reconciliation — a missed `user.deleted` event is a privacy incident, not a cosmetic bug.

**Neutral**

- Auth.js remains a viable fallback precisely because of the identity boundary. That is the point of paying the small cost of internal IDs now.

## Revisit when

- Clerk's MAU cost becomes material relative to revenue — set a concrete review trigger at the point where it exceeds infrastructure spend.
- Data residency or compliance requirements (DPDP, enterprise customers, corporate-travel deals) cannot be met on Clerk.
- We need an auth capability Clerk does not offer — SAML/SSO for corporate teams is the likeliest, and is a paid-tier feature worth pricing before committing to that market.
- Clerk changes pricing model or terms unfavourably.
- Two consecutive incidents where Clerk availability causes TripOS downtime.

If reversing: because domain tables reference internal IDs only, the migration is (a) stand up the replacement, (b) re-map `User.clerkUserId` to the new provider's identifier, (c) force a re-authentication cycle. Non-trivial but bounded, and it does not touch the domain model.
