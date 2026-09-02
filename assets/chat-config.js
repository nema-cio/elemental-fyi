// elemental.fyi — M1 begin chat backend (PUBLIC config only).
// Point endpoint at the site backend when Hermes wires it. Empty = stub/offline UI.
// Contract: POST JSON { sessionId, message, glyph?, line?, supabaseJwt? }
// Response JSON { reply, sessionId }
// Never put nsec, BUZZ_PRIVATE_KEY, or NIP-OA tags here.
window.ELEMENTAL_CHAT = {
  endpoint: "", // e.g. "https://api.example/begin-chat"
  // Optional public metadata (safe to ship):
  channelName: "elemental-fyi-begin",
  mouth: "Coordinator"
};
