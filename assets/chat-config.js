// elemental.fyi — M1 begin chat backend (PUBLIC config only).
// Contract: POST JSON { sessionId, message, glyph?, line?, supabaseJwt? }
// Response JSON { reply, sessionId }
// Never put nsec, BUZZ_PRIVATE_KEY, or NIP-OA tags here.
// Custom domain chat.elemental.fyi not set yet — use hstgr.cloud host for now.
window.ELEMENTAL_CHAT = {
  endpoint: "https://chat.srv1338664.hstgr.cloud/api/chat",
  // Optional public metadata (safe to ship):
  channelName: "elemental-fyi-begin",
  mouth: "Coordinator"
};
