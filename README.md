# elemental.fyi

Static site for **Elemental Sensemaking** — GitHub Pages from [`nema-cio/elemental-fyi`](https://github.com/nema-cio/elemental-fyi). Live: [elemental.fyi](https://elemental.fyi).

## Stack

- Static HTML/CSS/JS on GitHub Pages (`CNAME` → elemental.fyi)
- Supabase magic-link auth (`assets/auth.js`, `assets/supabase-config.js`) — progressive; pages work signed-out
- Relay readings under `relay/` (CYOA + Google Apps Script session endpoint)
- **M1 begin chat:** `begin.html` → Hostinger thin backend → Buzz public channel (Coordinator mouth). Secrets never on Pages.

## M1 begin chat (shipped)

| Piece | Where |
| --- | --- |
| UI | `begin.html` + `assets/chat.js` |
| Public config | `assets/chat-config.js` → `https://chat.srv1338664.hstgr.cloud/api/chat` |
| Contract | `docs/m1-begin-chat-api.md` |
| Backend ops | Hostinger VPS (Hermes); site-router nsec server-side only |
| Buzz channel | `elemental-fyi-begin` (UUID `9c085c6e-6e60-4924-baf4-71ed5feea5b2`) — **behind** the backend |

**Hard rules:** no nsec / NIP-OA / `BUZZ_PRIVATE_KEY` in this repo; do not reuse elemental-lab owner gates; do not post as Nema without Daniel’s approval; Discord is not the public mouth.

Health check: `https://chat.srv1338664.hstgr.cloud/health`  
Custom DNS `chat.elemental.fyi` may replace the `hstgr.cloud` host later — update `assets/chat-config.js` only.

## Product gaps (next)

- Sunday synthesis (`relay/synthesis/`) — shell only; no live weave yet
- Readings / published posts depth (`posts/`, `accounts/`)
- Sign-in polish and account thread UX
- Cross-links to the two Substacks
- After M1: six-element mention routing (out of M1 scope), `chat.elemental.fyi` DNS, CORS/health watch once Pages is live

## Handoff

See **[`docs/CLAUDE-HANDOFF.md`](docs/CLAUDE-HANDOFF.md)** for Claude / coding-agent review checklist and recommended next steps.

Site work for this repo has been driven by **Elemental Dev** (Grok Bot) via the Nema GitHub connector + Hermes Coordinator (Buzz/backend). Prefer PRs; do not put Buzz owner secrets in Pages commits.
