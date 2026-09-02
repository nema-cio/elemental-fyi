# M1 — begin.html public chat API

Thin Pages↔backend contract for the on-site chat on `begin.html`.

## Client config (public)

`assets/chat-config.js` ships only public metadata:

```js
window.ELEMENTAL_CHAT = {
  endpoint: "https://chat.srv1338664.hstgr.cloud/api/chat",
  channelName: "elemental-fyi-begin",
  mouth: "Coordinator"
};
```

Also accepted by the backend: `/api/begin-chat`. Health: `https://chat.srv1338664.hstgr.cloud/health`.
Custom domain `chat.elemental.fyi` is not set yet — use the `hstgr.cloud` host for now.

Never put `nsec`, `BUZZ_PRIVATE_KEY`, NIP-OA tags, or other Buzz secrets in Pages or client files. site-router secrets stay on the Hostinger VPS only.

## Request

`POST` JSON to `endpoint` with `Content-Type: application/json`:

| field | type | notes |
| --- | --- | --- |
| `sessionId` | string | Client-persisted (`localStorage` key `es_begin_chat_session`) |
| `message` | string | User text; client caps ~4KB |
| `glyph` | string? | Operator from the concern seed (e.g. `σ`) |
| `line` | string? | Quoted concern text |
| `supabaseJwt` | string? | From `ElementalAuth.getAccessToken()` when signed in |

## Response

JSON:

```json
{ "reply": "…", "sessionId": "…" }
```

The client appends `reply` to the thread and may refresh the stored `sessionId`.

## Stub / offline

When `endpoint` is empty, the UI stays quiet: send shows an italic system line that the channel isn’t open yet. No network call.

## Non-goals (M1)

- No Nema routing on Pages
- No Discord bridge in the client
- No six-angle / Sunday synthesis wiring here
- No `nsec` / Buzz private keys / elemental-lab UUIDs in client files

Buzz channel `elemental-fyi-begin` stays **behind the backend**. Pages only talk to the configurable HTTP endpoint.
