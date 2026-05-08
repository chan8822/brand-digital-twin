# UserBrief

Single, typed snapshot of a Tanmatra user's context that every AI agent
consumes. Pulls preferences, profile, recent orders, active subscription,
loyalty, premium, wellness, and time/location into one shape so agents
don't each re-fetch and re-shape the same data.

## Usage

In a route or tool handler:

```ts
import {
  getUserBriefForRequest,
  briefToPromptMarkdown,
} from "../lib/userBrief";

// Per-request memoized — multiple callers in the same request share one
// in-flight promise.
const brief = await getUserBriefForRequest(req, userId);

// Pass into runAgent via promptContext.
await runAgent({
  agent: "support",
  userId,
  messages,
  promptContext: { brief },
});
```

The agent's `definePrompt` build function reads `ctx.brief` and renders
it via `briefToPromptMarkdown` (or `briefToPromptJson`). See
`lib/ai/agents/support.ts` for the reference adoption.

## Caching

Two layers, both transparent:

1. **Per-request** — a Map attached to the Express `req`. Survives
   inside one HTTP request only.
2. **Per-process** — short TTL (30s) keyed by `userId + include set`.
   Cleared explicitly via `invalidateUserBrief(userId)` from any write
   path that mutates upstream data:
   - `POST/PUT/PATCH /api/preferences`
   - `PUT/PATCH /api/profile`
   - `POST /api/subscriptions`, pause / resume / cancel
   - `finalizeOrder` in `lib/loyaltyEngine.ts`

Add a new invalidation call whenever you ship a write path that touches
data exposed by the brief.

## Redaction

The brief built in-process can hold richer values than what reaches the
model. `redactBrief` (called by every prompt helper) returns a shape
restricted to the explicit allowlist in `redaction.ts`. Forbidden
fields (full address line, pincode, phone, email, last name, raw birth
date, payment tokens, delivery instructions, profile image URL) are
dropped — `userBrief.test.ts` proves this with both an allowlist check
and a negative scan over the rendered markdown / JSON.

## Adding a new section

1. Extend `UserBrief` and the matching `Brief*` interface in `types.ts`.
2. Add a `loadXxx(userId)` in `loader.ts`, wrap it in `safeLoad` so a
   bad query never breaks the whole brief, and add it to the
   `Promise.all` block.
3. Add the safe-for-prompt fields to `PROMPT_ALLOWLIST` in
   `redaction.ts` and extend `RedactedBrief`.
4. Render it in `briefToPromptMarkdown` (skip when the section is null).
5. Add a fixture covering the new section to `userBrief.test.ts` —
   include any forbidden fields you need to defend against and assert
   `findForbiddenFields` returns empty.
6. Wire `invalidateUserBrief(userId)` into the route(s) that mutate the
   underlying data.

## Tests

```bash
pnpm --filter @workspace/api-server run test:user-brief
```
