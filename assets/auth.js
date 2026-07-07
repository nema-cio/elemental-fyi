/* elemental.fyi — accounts (Supabase magic links). Progressive enhancement only:
 * every page works signed-out; this adds a quiet sign-in and, once signed in,
 * lets readings and story progress attach to the person instead of the browser.
 *
 * Include AFTER assets/supabase-config.js:
 *   <script src="…/assets/supabase-config.js"></script>
 *   <script type="module" src="…/assets/auth.js"></script>
 *
 * API (window.ElementalAuth): user() · signIn(email) · signOut() · open() ·
 *   onChange(cb) · saveReading(sessionId,title,phiChain) ·
 *   saveProgress(trackId,chapter,completed) · getProgress() · ready (Promise)
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg = window.ELEMENTAL_SUPABASE;
if (!cfg || !cfg.url) {
  console.warn("[auth] supabase-config.js missing — accounts disabled");
} else {
  const sb = createClient(cfg.url, cfg.publishableKey);
  let user = null;
  const listeners = [];

  // ---- quiet widget (site design language) -------------------------------------------
  const css = document.createElement("style");
  css.textContent =
    '.es-auth{position:fixed;top:16px;right:20px;z-index:60;font-family:"EB Garamond",Garamond,Georgia,serif;font-size:15px;text-align:right}' +
    ".es-auth a,.es-auth button{font-family:inherit;font-size:inherit;font-style:italic;color:#B8923C;background:none;border:0;border-bottom:1px solid rgba(184,146,60,.55);padding:0 0 1px;cursor:pointer;text-decoration:none}" +
    ".es-auth a:hover,.es-auth button:hover{color:#1F2A2E;border-bottom-color:#1F2A2E}" +
    ".es-auth .who{font-style:italic;opacity:.62;color:#1F2A2E;margin-right:.7em;border:0}" +
    ".es-auth-panel{display:none;margin-top:.6em;background:#F4F1EA;border:1px solid rgba(31,42,46,.18);padding:1em 1.1em;width:min(300px,86vw);box-shadow:0 6px 24px rgba(31,42,46,.08);text-align:left}" +
    ".es-auth-panel.open{display:block}" +
    ".es-auth-panel p{margin:0 0 .7em;font-size:.92em;line-height:1.5;color:#1F2A2E}" +
    ".es-auth-panel input{width:100%;background:transparent;border:0;border-bottom:1px solid rgba(31,42,46,.28);padding:.35em .1em;font-family:inherit;font-size:1em;color:#1F2A2E;outline:none}" +
    ".es-auth-panel .row{margin-top:.9em;display:flex;justify-content:space-between;align-items:baseline}" +
    ".es-auth-panel .msg{font-size:.85em;font-style:italic;opacity:.75;margin:.8em 0 0}";
  document.head.appendChild(css);

  const root = document.createElement("div");
  root.className = "es-auth";
  root.innerHTML =
    '<span class="es-auth-line"></span>' +
    '<div class="es-auth-panel" role="dialog" aria-label="Sign in">' +
    "<p>A sign-in link, sent to your email. No password — the link is the key.</p>" +
    '<input type="email" placeholder="you@somewhere" aria-label="Email address">' +
    '<div class="row"><button type="button" class="es-cancel">close</button>' +
    '<button type="button" class="es-send">send the link →</button></div>' +
    '<p class="msg" hidden></p>' +
    '<p style="font-size:.78em;font-style:italic;opacity:.55;margin:.8em 0 0;">If the link doesn’t arrive in a minute, check your spam folder.</p></div>';
  document.body.appendChild(root);
  const line = root.querySelector(".es-auth-line");
  const panel = root.querySelector(".es-auth-panel");
  const input = panel.querySelector("input");
  const msg = panel.querySelector(".msg");

  // account page lives at the site root; compute the relative prefix from page depth
  const ROOT = "../".repeat(Math.max(0, location.pathname.split("/").length - 2));
  function render() {
    if (user) {
      const name = (user.email || "").split("@")[0];
      line.innerHTML = '<a class="who" href="' + ROOT + 'account.html" style="border-bottom:1px solid rgba(31,42,46,.25)">' + name + "</a>" +
        '<button type="button" class="es-out">sign out</button>';
      line.querySelector(".es-out").addEventListener("click", () => api.signOut());
    } else {
      line.innerHTML = '<a href="#" class="es-in">sign in</a>';
      line.querySelector(".es-in").addEventListener("click", (e) => { e.preventDefault(); api.open(); });
    }
    listeners.forEach((cb) => { try { cb(user); } catch (e) {} });
  }
  function note(t) { msg.hidden = false; msg.textContent = t; }

  panel.querySelector(".es-cancel").addEventListener("click", () => panel.classList.remove("open"));
  panel.querySelector(".es-send").addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  async function send() {
    const email = (input.value || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { input.focus(); return; }
    note("sending…");
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname + location.search },
    });
    note(error ? "that didn’t send — try again in a minute" :
      "the link is on its way — check your email, then return here");
  }

  // ---- data --------------------------------------------------------------------------
  const api = {
    ready: null,
    user: () => user,
    onChange: (cb) => listeners.push(cb),
    open: () => { panel.classList.add("open"); input.focus(); },
    signIn: (email) => { input.value = email || ""; api.open(); },
    signOut: async () => { await sb.auth.signOut(); },
    // a completed/advancing relay attaches to the person (upsert: one row per session)
    saveReading: async (sessionId, title, phiChain) => {
      if (!user || !sessionId) return false;
      const { error } = await sb.from("saved_readings").upsert(
        { user_id: user.id, session_id: sessionId, title: title || null, phi_chain: phiChain || null },
        { onConflict: "user_id,session_id" });
      if (error) console.warn("[auth] saveReading:", error.message);
      return !error;
    },
    saveProgress: async (trackId, chapter, completed) => {
      if (!user || !trackId) return false;
      const row = { user_id: user.id, track_id: trackId, chapter: chapter | 0,
                    updated_at: new Date().toISOString() };
      if (completed) row.completed_at = new Date().toISOString();
      const { error } = await sb.from("reading_progress").upsert(row, { onConflict: "user_id,track_id" });
      if (error) console.warn("[auth] saveProgress:", error.message);
      return !error;
    },
    getProgress: async () => {
      if (!user) return [];
      const { data } = await sb.from("reading_progress").select("*");
      return data || [];
    },
    getProfile: async () => {
      if (!user) return null;
      const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
    updateProfile: async (fields) => {
      if (!user) return false;
      const row = Object.assign({ id: user.id, updated_at: new Date().toISOString() }, fields);
      const { error } = await sb.from("profiles").upsert(row);
      if (error) console.warn("[auth] updateProfile:", error.message);
      return !error;
    },
    getReadings: async () => {
      if (!user) return [];
      const { data } = await sb.from("saved_readings").select("*").order("saved_at", { ascending: false });
      return data || [];
    },
    getContributions: async () => {
      if (!user) return [];
      const { data, error } = await sb.from("contributions").select("*").order("created_at", { ascending: false });
      return error ? [] : (data || []);   // table may not exist until migration 002 runs
    },
    // "Real Accounts from readings" — a deliberate, anonymized, editor-gated consent
    getConsents: async () => {
      if (!user) return [];
      const { data, error } = await sb.from("account_consent").select("*");
      return error ? [] : (data || []);
    },
    consentToAccount: async (sessionId, credit, note) => {
      if (!user || !sessionId) return false;
      const { error } = await sb.from("account_consent").upsert(
        { user_id: user.id, session_id: sessionId,
          display_credit: (credit || "").trim() || null,
          note: (note || "").trim() || null, status: "requested" },
        { onConflict: "user_id,session_id" });
      if (error) console.warn("[auth] consentToAccount:", error.message);
      return !error;
    },
    withdrawAccountConsent: async (sessionId) => {
      if (!user || !sessionId) return false;
      const { error } = await sb.from("account_consent")
        .update({ status: "withdrawn" }).eq("user_id", user.id).eq("session_id", sessionId);
      return !error;
    },
  };
  window.ElementalAuth = api;

  api.ready = sb.auth.getSession().then(({ data }) => {
    user = data.session ? data.session.user : null;
    render();
  });
  sb.auth.onAuthStateChange((_evt, session) => {
    user = session ? session.user : null;
    panel.classList.remove("open");
    render();
  });
}
