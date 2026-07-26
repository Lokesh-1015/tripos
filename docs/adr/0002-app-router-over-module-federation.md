# ADR-0002: Next.js App Router; no Module Federation

**Status:** Accepted
**Date:** 2026-07-26
**Deciders:** Product owner, lead architect

## Context

`prd.md` requires six independently developed micro frontends (`shell`, `auth`, `trips`, `expenses`, `profile`, `admin`) and specifies _"Next.js (App Router) + TypeScript … Enable module federation or equivalent MFE strategy."_

**These two requirements are mutually exclusive.**

- `@module-federation/nextjs-mf`, the only real Next.js federation plugin, supports the **Pages Router only**; its documentation states the App Router is unsupported.
- This is structural rather than a missing feature. React Server Components resolve their module graph **on the server** and stream results over the Flight protocol; runtime module federation assumes a **client-resolvable** graph. The two models are architecturally opposed.
- Turbopack, the default bundler in current Next versions, has no Module Federation support at all.
- Nx's `module-federation` generators target React on webpack/rspack, not Next.js App Router.

Separately, the PRD's own §21 "SEO-friendly" requirement works against federation — federated remotes are hostile to SSR and prerendering.

A decision was required before any scaffolding, because it determines the shape of the entire frontend.

## Options considered

**A. App Router, single Next application, feature libraries.** RSC, streaming, Server Actions, one build, one deploy, trivially shared auth session. Module isolation via Nx tags rather than runtime federation. Loses independent deploy cadence per module.

**B. Pages Router + Module Federation.** True runtime federation and independent deploys, but permanently forecloses RSC and the App Router, depends on a thinly maintained plugin, and SSR-plus-federation is notoriously fragile. Building a new product on the legacy router in order to use a plugin that fights the framework is the wrong trade.

**C. Next.js Multi-Zones (App Router).** The officially supported Next "MFE": each zone is an independent App Router application with its own `basePath`, stitched by rewrites from a shell. Genuine independent builds and deploys. Costs a full page load when crossing zones, duplicates framework bundles, and requires cross-zone auth cookie configuration.

**D. Drop Next for the app shell** — Vite/rsbuild + React Router + Module Federation 2.0. The cleanest true-MFE story available, but loses SSR, SEO, and the Next ecosystem, and the marketing site becomes a separate app regardless.

## Decision

**Option A now, with Option C as the pre-designed extraction path.**

- One `apps/web` on the App Router.
- Every PRD frontend module becomes Nx libraries: `libs/web/<domain>/{feature,ui,data-access}`, plus `libs/web/shell/*`.
- Isolation enforced by `@nx/enforce-module-boundaries`: `libs/web/trips/*` **cannot** import from `libs/web/expenses/*`, and CI fails if it tries.
- `apps/auth` is dropped — authentication is a shell concern (Clerk middleware plus a few components), and splitting it would add a redirect and a full page load to the most conversion-sensitive path in the product.
- `apps/admin` is deferred — the PRD defines no admin requirements anywhere, and an admin tool that can read trips containing passport scans deserves its own design pass rather than a day-one empty scaffold.
- Marketing pages become a statically rendered route group, which is where the only real SEO surface lives.

This preserves what is actually valuable about MFE — enforced module isolation, clear ownership, `nx affected` incremental builds, the ability to reason about one domain in isolation — while declining what is expensive: six Vercel projects, six pipelines, shared-dependency version skew, duplicated React/Next bundles shipped to users on hotel wifi, and a failure mode where a host/remote type mismatch appears as a white screen in production.

## Consequences

**Positive**

- RSC, streaming, and Server Actions remain available; the framework is used as designed.
- One deploy, one auth session, one bundle graph. No cross-origin session plumbing.
- The invite-acceptance path — the product's most important flow, since a trip with one member has no value — stays as fast and redirect-free as possible.
- Boundary violations are caught at lint time rather than as production runtime errors.

**Negative**

- No independent deploy cadence per frontend module. Accepted: with one developer this buys nothing.
- A single large build. Mitigated by `nx affected` and route-level code splitting.
- Deviates from PRD §13 and §19 as written; both need amending.

**Neutral**

- Domain decomposition is unchanged — the same six modules exist, as libraries rather than applications.

## Revisit when

Move a domain to a Multi-Zone application (Option C) when:

- A second team owns a frontend domain and shared-pipeline coordination becomes a bottleneck.
- A domain needs a materially different release cadence from the rest of the app.
- Build times become painful in a way `nx affected` and code splitting cannot fix.

Because the library boundaries are enforced from day one, extraction is days rather than a rewrite: a `libs/web/<domain>/*` tree becomes an app with a `basePath`, and the shell adds a rewrite.

Revisit **Option D** only if the product pivots away from needing SSR entirely — unlikely, given shared trip replays and public templates are on the roadmap.

Do **not** revisit Option B. If runtime federation ever becomes genuinely necessary, the ecosystem will have moved and this ADR should be superseded with current facts rather than these.
