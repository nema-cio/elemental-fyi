# Handoff for Claude coding agents — elemental.fyi

**From:** Elemental Dev (site) + Hermes Coordinator (Buzz / Hostinger chat backend)  
**When:** 2026-09-02  
**Repo:** `nema-cio/elemental-fyi` (GitHub Pages)  
**PR merged / merging:** [#1 M1 begin chat UI](https://github.com/nema-cio/elemental-fyi/pull/1)

## What just shipped (M1)

Public helper chat on `begin.html`:

1. User picks a concern → glyph + line seed  
2. On-site chat panel (`ElementalBeginChat`) POSTs to Hostinger  
3. Backend uses **site-router** (server-only secrets) to mention **Coordinator** on Buzz channel `elemental-fyi-begin`  
4. Reply returns as `{ reply, sessionId }`

### Key files

| File | Role |
| --- | --- |
| `begin.html` | Seed UI + chat mount |
| `assets/chat.js` | Client send/mount/setSeed, localStorage session |
| `assets/chat-config.js` | **Only** public endpoint URL + metadata |
| `assets/auth.js` | Supabase magic link + `getAccessToken()` for optional `supabaseJwt` |
| `docs/m1-begin-chat-api.md` | Pages↔backend contract |

### Endpoint (current)

```
https://chat.srv1338664.hstgr.cloud/api/chat
```

Also: `/api/begin-chat`. Health: `/health`. CORS smoke: `access-control-allow-origin: https://elemental.fyi`.

Ops notes for the VPS live under Daniel’s machine at  
`/Users/nema/Projects/buzz-elemental-bridge/docs/m1-chat-backend.md`  
(and earlier public Buzz contract: `…/docs/m1-public-buzz-contract.md`). **Do not** copy nsecs into this repo.

## Review checklist (please do)

- [ ] Read `begin.html` seed → chat wiring; match site register (no generic chatbot chrome)
- [ ] Confirm `assets/chat-config.js` has **no** secrets; only the public HTTPS endpoint
- [ ] After Pages deploy: open https://elemental.fyi/begin.html — pick a concern, send a message, confirm Coordinator reply
- [ ] Confirm CORS still works from Pages origin (not only curl)
- [ ] Confirm signed-out path works; signed-in path optionally sends `supabaseJwt`
- [ ] Grep the client for nsec / elemental-lab / Discord mouth regressions

## Recommended next steps for coding agents

Ordered roughly by value; keep M1 non-goals unless Daniel expands scope.

1. **Post-merge smoke on Pages** — fix CORS/health with Hermes if anything fails once live.  
2. **`chat.elemental.fyi` DNS** — when set, one-line swap in `assets/chat-config.js` (+ doc).  
3. **Sunday synthesis** — `relay/synthesis/index.html` is a placeholder; design how completed relays feed Aether weave (content + static publish pipeline).  
4. **Readings depth** — `posts/` and account-consent → published accounts flow.  
5. **Sign-in / account thread** — polish `account.html` readings list + progress.  
6. **Substack cross-links** — two Substacks; surface from ledger/footer without breaking soft register.  
7. **M2 (only if asked)** — six-element mention routing; still never put Buzz keys on Pages; keep elemental-lab owner-only.

## Explicit non-goals (still)

- Browser-side Buzz signing  
- elemental-lab traffic from the site  
- Nema / Discord / Telegram as the public mouth  
- Widening lab `owner-only` ACP for public traffic  

## Contacts / owners

| Surface | Owner |
| --- | --- |
| Pages UI / this repo | Elemental Dev (or Claude coding agents on PRs) |
| Buzz public channel + Hostinger chat service | Hermes Coordinator |
| Product / merge calls | Daniel |

When changing the chat contract, update `docs/m1-begin-chat-api.md` and ping Hermes before flipping production endpoint behavior.
