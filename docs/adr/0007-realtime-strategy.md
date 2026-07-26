# ADR-0007: Realtime strategy — deferred through M5, then Socket.IO on the persistent tier

**Status:** Accepted
**Date:** 2026-07-26
**Deciders:** Product owner, lead architect

## Context

`prd.md` §15 specifies "WebSockets for real-time functionality" and §17 specifies Socket.IO. §17 also deploys the frontend to Vercel.

**Vercel cannot host a long-lived WebSocket server.** Its serverless and edge runtimes are request-scoped; there is nowhere for a persistent connection to live. This is a direct contradiction in the PRD's own deployment section.

Separately, "realtime" was specified without asking which features actually need it. Collaborative editing, presence, and live sync are where scope reliably explodes — and most of what feels realtime in a well-built app is optimistic UI plus prompt revalidation, not a socket.

The decision to keep chat in MVP (ADR-0008) changes the calculus materially: chat without realtime is not chat. What was optional through M5 becomes mandatory at M6.

## Options considered

**A. No realtime; optimistic UI + SWR revalidation.** Covers far more than people expect — an itinerary that updates within a second or two of opening the screen reads as live. Zero infrastructure. Insufficient for chat.

**B. Self-hosted Socket.IO in the API.** Full control, no per-connection cost, uses the Redis we already run. Requires the API to be on a persistent container (it is — ADR-0001), requires the Redis adapter for multi-instance, and connection management/scaling becomes our operational problem.

**C. Hosted realtime (Ably, Pusher).** Connection scaling, presence, and history become someone else's problem. Per-connection/per-message pricing that grows with success, plus a third-party in the data path for trip messages — a privacy consideration given what is discussed on a trip.

**D. Postgres `LISTEN`/`NOTIFY`.** Neat for change propagation with no extra infrastructure, but it is not a client transport — you still need a socket layer in front. Solves a different problem.

**E. Supabase Realtime.** Only coherent if Supabase were the platform. It is not (ADR-0003, Cloudflare R2 for storage).

## Decision

**Two phases.**

**M1 → M5: no realtime.** Optimistic UI plus SWR/query revalidation (Option A). `CLAUDE.md` §13 states the rule: do not reach for sockets before M6. Trip creation, polls, expenses, itinerary, tasks, packing, and documents all work well this way, and shipping them without a socket layer means five milestones of avoided complexity.

**M6 onward: Socket.IO in `apps/api`** (Option B), introduced with the notification and chat work.

- Runs in `apps/api` on Railway/Render — the persistent-container tier, **never Vercel**. This resolves the PRD contradiction.
- **Redis adapter configured from the first commit of the socket layer.** Single-node without it is not a shortcut, it is a rewrite the moment a second instance starts, and it will be discovered in production.
- One room per trip. Handshake authenticated with a Clerk token; **membership and role verified on room join via the same policy layer as HTTP** (ADR-0006). A client-supplied `tripId` is never trusted.
- Reconnect performs backfill from the client's last-known message id rather than replaying blindly.
- The socket layer is transport only. It carries events emitted by the domain event bus (ADR-0001) and holds no business logic — so extracting a realtime service later, or swapping to Option C, touches one adapter.
- Realtime is an **enhancement, never the only path.** Every realtime-updated view must also load correctly on a plain fetch. This mirrors the PRD's AI philosophy (§11) and means a socket outage degrades the product rather than breaking it.

**Scope at M6:** chat messages, unread counts, mention notifications. **Deferred:** typing indicators, read receipts, presence, live cursors, collaborative itinerary editing. Concurrent itinerary edits are handled by optimistic concurrency with row versions and fractional ordering keys (`CLAUDE.md` §8), not by a socket.

## Consequences

**Positive**

- Five milestones shipped without socket infrastructure, its failure modes, or its testing burden.
- Reuses Redis, already present for caching and BullMQ.
- No per-connection vendor cost; no third party in the path of trip conversations.
- Because the socket layer is a thin transport over domain events, switching to a hosted provider later is an adapter change.

**Negative**

- Connection scaling and operations are ours. Sticky sessions or the Redis adapter must be correct, and WebSocket behaviour behind the platform's proxy needs verifying early — test this at the start of M6, not at the end.
- Socket.IO adds client bundle weight. Load it only on routes that need it.
- Local development gains a moving part; docker-compose Redis becomes required rather than merely recommended.
- Sockets are genuinely harder to test than HTTP. Budget for it in M6, and keep business logic out of gateways so most of it is testable without a socket at all.

**Neutral**

- Option C remains available and becomes more attractive as connection counts grow. The adapter boundary is what keeps that door open.

## Revisit when

- Concurrent connection counts or fan-out volume make self-hosting an operational burden — that is the trigger for a hosted provider (Option C), and the socket layer's isolation is what makes it cheap.
- Operating the socket tier begins consuming meaningful engineering time relative to feature work.
- Presence or collaborative editing becomes a genuine product requirement, at which point evaluate purpose-built tooling rather than extending this layer.
- The `chat` domain is extracted per ADR-0001's triggers — connection-bound fan-out is the most likely first extraction, and the realtime tier would move with it.
