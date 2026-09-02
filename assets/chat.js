/* elemental.fyi — M1 begin.html on-site chat (PUBLIC client).
 * Reads window.ELEMENTAL_CHAT. Persists sessionId in localStorage
 * key `es_begin_chat_session`. Never ships nsec / Buzz private keys.
 *
 * API (window.ElementalBeginChat):
 *   send({ message, glyph?, line? }) · mount(rootEl) · setSeed({ glyph, line, seedText })
 */
(function () {
  var SESSION_KEY = "es_begin_chat_session";
  var MAX_MSG = 4096;
  var cfg = function () {
    return window.ELEMENTAL_CHAT || { endpoint: "" };
  };

  function uuidish() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "es-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function getSessionId() {
    try {
      var id = localStorage.getItem(SESSION_KEY);
      if (id && id.length > 8) return id;
      id = uuidish();
      localStorage.setItem(SESSION_KEY, id);
      return id;
    } catch (e) {
      return uuidish();
    }
  }

  var state = {
    root: null,
    thread: null,
    input: null,
    sendBtn: null,
    errEl: null,
    glyph: "",
    line: "",
    seedText: "",
    seedPending: false,
    inFlight: false,
    mounted: false,
  };

  function appendTurn(kind, text) {
    if (!state.thread) return;
    var el = document.createElement("p");
    el.className = "begin-chat-turn begin-chat-turn--" + kind;
    el.textContent = text;
    state.thread.appendChild(el);
    state.thread.scrollTop = state.thread.scrollHeight;
  }

  function setError(msg) {
    if (!state.errEl) return;
    if (!msg) {
      state.errEl.hidden = true;
      state.errEl.textContent = "";
      return;
    }
    state.errEl.hidden = false;
    state.errEl.textContent = msg;
  }

  function setBusy(busy) {
    state.inFlight = busy;
    if (state.sendBtn) state.sendBtn.disabled = !!busy;
    if (state.input) state.input.disabled = !!busy;
  }

  async function resolveJwt() {
    try {
      var A = window.ElementalAuth;
      if (!A || typeof A.getAccessToken !== "function") return null;
      return (await A.getAccessToken()) || null;
    } catch (e) {
      return null;
    }
  }

  async function send(opts) {
    opts = opts || {};
    var message = (opts.message != null ? String(opts.message) : "").trim();
    if (!message || state.inFlight) return null;
    if (message.length > MAX_MSG) message = message.slice(0, MAX_MSG);

    var glyph = opts.glyph != null ? opts.glyph : state.glyph;
    var line = opts.line != null ? opts.line : state.line;

    // First send after a seed: prefer glyph+line derived from the seed.
    if (state.seedPending) {
      if (!glyph && state.glyph) glyph = state.glyph;
      if (!line && state.line) line = state.line;
      state.seedPending = false;
    }

    setError("");
    appendTurn("user", message);
    setBusy(true);

    var endpoint = (cfg().endpoint || "").trim();
    if (!endpoint) {
      appendTurn(
        "system",
        "the channel isn’t open on this page yet — check back shortly"
      );
      setBusy(false);
      return { reply: null, stub: true };
    }

    var body = {
      sessionId: getSessionId(),
      message: message,
    };
    if (glyph) body.glyph = glyph;
    if (line) body.line = line;

    var jwt = await resolveJwt();
    if (jwt) body.supabaseJwt = jwt;

    try {
      var res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        appendTurn("system", "the channel wavered — try again in a moment");
        setError("couldn’t reach the elements just now");
        setBusy(false);
        return null;
      }
      var data = await res.json().catch(function () {
        return null;
      });
      if (!data || data.reply == null) {
        appendTurn("system", "the channel returned silence — try again shortly");
        setError("quiet reply missing");
        setBusy(false);
        return null;
      }
      if (data.sessionId) {
        try {
          localStorage.setItem(SESSION_KEY, String(data.sessionId));
        } catch (e) {}
      }
      appendTurn("reply", String(data.reply));
      setBusy(false);
      return data;
    } catch (e) {
      appendTurn("system", "the channel wavered — try again in a moment");
      setError("network quiet — try again shortly");
      setBusy(false);
      return null;
    }
  }

  function onSendClick() {
    if (!state.input) return;
    var msg = state.input.value;
    state.input.value = "";
    send({ message: msg }).then(function () {
      if (state.input) state.input.focus();
    });
  }

  function mount(rootEl) {
    if (!rootEl) return;
    state.root = rootEl;
    if (!state.mounted) {
      rootEl.innerHTML =
        '<div class="begin-chat-thread" aria-live="polite"></div>' +
        '<div class="begin-chat-compose">' +
        '<textarea class="begin-chat-input" rows="2" placeholder="speak with the elements…" aria-label="Message to the elements"></textarea>' +
        '<button type="button" class="begin-chat-send door">send →</button>' +
        "</div>" +
        '<p class="begin-chat-err" hidden></p>';
      state.thread = rootEl.querySelector(".begin-chat-thread");
      state.input = rootEl.querySelector(".begin-chat-input");
      state.sendBtn = rootEl.querySelector(".begin-chat-send");
      state.errEl = rootEl.querySelector(".begin-chat-err");
      state.sendBtn.addEventListener("click", onSendClick);
      state.input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSendClick();
        }
      });
      state.mounted = true;
    }
    rootEl.hidden = false;
    // Optional focus on first open — never auto-send.
    if (state.input) {
      try {
        state.input.focus({ preventScroll: true });
      } catch (e) {
        state.input.focus();
      }
    }
  }

  function setSeed(opts) {
    opts = opts || {};
    state.glyph = opts.glyph != null ? String(opts.glyph) : "";
    state.line = opts.line != null ? String(opts.line) : "";
    state.seedText = opts.seedText != null ? String(opts.seedText) : "";
    state.seedPending = !!(state.glyph || state.line);
  }

  window.ElementalBeginChat = {
    send: send,
    mount: mount,
    setSeed: setSeed,
  };
})();
