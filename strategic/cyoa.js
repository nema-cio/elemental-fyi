/* Strategic CYOA — client engine + page driver (full six-element relay).
 *
 * Renders any element's 3-level decision tree from taxonomy.json (sub-domain → facet →
 * stance) and compiles the leaf into a strategic nemetic.φ: <operator>(<facet_id> | <stance>).
 * The stance also fixes the leaf's z_state (peril→hostile, possibility→open, pressure→pure).
 *
 * The relay is a fixed CYCLE: Air → Water → Fire → Wood → Earth → Metal → (Air…). A new
 * session may be started at ANY element; its order is the rotation beginning there, so every
 * session still visits all six. Each element page is BOTH a Start door (no ?s=) and a
 * Continue door (?s=<id>) — CYOA.page() wires whichever the URL asks for.
 *
 * Shared state lives in a Google Apps Script web app (one /exec, same script as intake):
 *   start    POST {action:'start',  session_id, title, order, entry}   (client makes the id)
 *   advance  POST {action:'advance', session_id, entry}
 *   session  GET  ?action=session&s=<id>                               (public read)
 * POSTs are no-cors text/plain (fire-and-forget — the client already holds the id); the
 * session GET reads cross-origin via Apps Script's redirect to a CORS-open googleusercontent URL.
 */
window.CYOA = (function () {
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbxArMD_riaWpEeTZdjcX6VHVWpOZPtcQaAayk68K_B3DiQUJk7Z2iimv-EnlxAS7g0/exec";
  // The fixed relay cycle (STRATEGIC_CYOA_SPEC.md §3).
  const ORDER = ["Air", "Water", "Fire", "Wood", "Earth", "Metal"];

  // One-line voice per element, shown as orientation under the headline.
  const BLURB = {
    Air: "Air sees first — it cuts signal from noise so a strategy has something true to stand on.",
    Water: "Water feels the field — who's coupled to this, what carries across, where trust holds or breaks.",
    Fire: "Fire gives it direction — where this is heading, what it's for, and what the push will cost.",
    Wood: "Wood opens what's next — the branches trying to grow before the path narrows.",
    Earth: "Earth weighs what it costs — what feeds the system, what exhausts it, what the body can carry.",
    Metal: "Metal holds the form — the boundaries that keep it whole without becoming a cage."
  };
  const PAGE = el => el.toLowerCase() + ".html";
  const rotated = element => {
    const i = ORDER.indexOf(element);
    return ORDER.slice(i).concat(ORDER.slice(0, i));
  };

  let TAX = null;
  const taxonomy = () => fetch("taxonomy.json").then(r => r.json()).then(t => (TAX = t));
  const elementByName = name => TAX.elements.find(e => e.element === name);
  const stanceById = id => TAX.stances.find(s => s.id === id);

  // ---- DOM helpers --------------------------------------------------------------------
  const q = sel => document.querySelector(sel);
  function elc(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  const clear = m => { while (m.firstChild) m.removeChild(m.firstChild); };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  // Render one choice-step: a framing question + a column of option "doors".
  function step(mount, framing, options, onPick) {
    clear(mount);
    if (framing) mount.appendChild(elc("p", "cyoa-framing", esc(framing)));
    const list = elc("div", "cyoa-options");
    options.forEach(opt => {
      const b = elc("button", "cyoa-door");
      b.type = "button";
      b.innerHTML = '<span class="cyoa-door-label">' + esc(opt.label) + "</span>" +
        (opt.hint ? '<span class="cyoa-door-hint">' + esc(opt.hint) + "</span>" : "");
      b.addEventListener("click", () => onPick(opt));
      list.appendChild(b);
    });
    mount.appendChild(list);
  }

  // ---- leaf → φ -----------------------------------------------------------------------
  function compileLeaf(element, subdomain, facet, stanceId) {
    const stance = stanceById(stanceId);
    return {
      element: element.element, operator: element.operator,
      subdomain_id: subdomain.id, facet_id: facet.id,
      stance: stanceId, z_state: stance.z_state,
      phi: element.operator + "(" + facet.id + " | " + stanceId + ")",
      reading: element.element + " — " + facet.text + " — " + element.stance_frames[stanceId]
    };
  }

  // ---- play one element's tree, resolve to a leaf entry -------------------------------
  function playElement(mount, elementName) {
    const element = elementByName(elementName);
    return new Promise(resolve => {
      step(mount, element.diagnostic.core_question,
        element.branches.map(b => ({ label: b.title, ref: b })),
        pickB => {
          const branch = pickB.ref;
          step(mount, "Within “" + branch.title + "”, what's live?",
            branch.facets.map(f => ({ label: f.text, ref: f })),
            pickF => {
              const facet = pickF.ref;
              step(mount, "How is this live right now?",
                TAX.stances.map(s => ({ label: s.label, hint: element.stance_frames[s.id], ref: s })),
                pickS => resolve(compileLeaf(element, branch, facet, pickS.ref.id)));
            });
        });
    });
  }

  // ---- transport ----------------------------------------------------------------------
  function post(payload) {
    return fetch(ENDPOINT, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }
  function getSession(sessionId, tries) {
    tries = tries == null ? 4 : tries;
    return fetch(ENDPOINT + "?action=session&s=" + encodeURIComponent(sessionId))
      .then(r => r.json())
      .then(j => {
        if (j && j.ok) return j.session;
        if (tries > 0) return new Promise(res => setTimeout(res, 1200)).then(() => getSession(sessionId, tries - 1));
        return null;
      })
      .catch(() => (tries > 0
        ? new Promise(res => setTimeout(res, 1200)).then(() => getSession(sessionId, tries - 1))
        : null));
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  const chainPhi = chain => chain.map(c => c.phi).join(" ∘ ");
  const awaitingOf = s => (s.status && s.status.indexOf("awaiting:") === 0) ? s.status.split(":")[1] : null;

  // ---- core flows ---------------------------------------------------------------------

  // START — element seeds a new session; order is the rotation beginning at it.
  function start(opts) {
    return taxonomy().then(() => playElement(opts.mount, opts.element)).then(entry => {
      const sessionId = uuid();
      const order = (opts.order || rotated(opts.element)).slice();
      const title = (opts.title && opts.title.trim()) ||
        (entry.element + " reads " + entry.facet_id.replace(/_/g, " "));
      post({ action: "start", session_id: sessionId, title: title,
             order: JSON.stringify(order), entry: JSON.stringify(entry) });
      const nextEl = order[1] || null;
      opts.onComplete(entry, sessionId, nextEl, title);
    });
  }

  // CONTINUE — load a waiting session, show the incoming φ, play THIS element seeded by it.
  function cont(opts) {
    return taxonomy().then(() => getSession(opts.sessionId)).then(session => {
      if (!session) { opts.onMissing && opts.onMissing(); return; }
      const awaiting = awaitingOf(session);
      if (session.status === "complete") { opts.onMismatch && opts.onMismatch(session, "complete"); return; }
      if (awaiting && awaiting !== opts.element) { opts.onMismatch && opts.onMismatch(session, awaiting); return; }
      if (opts.onIncoming) opts.onIncoming(session);
      return playElement(opts.mount, opts.element).then(entry => {
        post({ action: "advance", session_id: opts.sessionId, entry: JSON.stringify(entry) });
        const chain = session.chain.concat([entry]);
        const nextEl = chain.length < session.order.length ? session.order[chain.length] : null;
        opts.onComplete(entry, session, chain, nextEl);
      });
    });
  }

  // ---- the page driver: wires a whole element page (Start or Continue) ----------------
  function page(opts) {
    return taxonomy().then(() => {
      const element = elementByName(opts.element);
      const El = element.element;
      const sid = new URLSearchParams(location.search).get("s");
      const head = q("#head"), intro = q("#intro"), game = q("#game"),
            resolve = q("#resolve"), incoming = q("#incoming");

      head.innerHTML =
        '<span class="element-mark" aria-hidden="true">' + element.operator + '</span>' +
        '<p class="eyebrow">a strategic reading · ' + (sid ? "continues" : "begins") + " with " + El.toLowerCase() + '</p>' +
        '<h1>' + esc(element.diagnostic.core_question) + '</h1>' +
        '<p class="orientation">' + esc(BLURB[El]) + '</p>' +
        (sid ? "" :
          '<p class="orientation">Walk three choices; ' + El + ' cuts one line — a <em>nemetic.φ</em> — ' +
          'and hands it to the next element. Six elements, six φ, and a synthesis at the end. ' +
          'Walk the whole relay yourself, or hand each φ to someone else.</p>');

      const showResolveStart = (entry, sessionId, nextEl, title) => {
        game.hidden = true;
        const nextUrl = nextEl ? PAGE(nextEl) + "?s=" + sessionId : null;
        resolve.innerHTML =
          '<p class="label">' + El + "’s reading — the φ to carry forward</p>" +
          '<p class="phi">' + esc(entry.phi) + "</p>" +
          '<p class="reading">' + esc(entry.reading) + "</p>" +
          (nextUrl ? '<p style="margin:0 0 1.2em;"><a class="door-link" href="' + nextUrl + '"><em>Carry it to ' + nextEl + " →</em></a></p>" : "") +
          '<div class="copy-row"><span>or hand it off:</span><code>' + esc(entry.phi) + '</code><button type="button" class="copy-btn">copy the line</button></div>' +
          '<p style="font-style:italic;opacity:0.7;font-size:0.9em;margin:2em 0 0;">“' + esc(title) + "” · " + nextEl +
          " is now waiting. Open the door above to play their tree seeded by this φ — or send the link to someone else to make the handoff.</p>";
        wireCopy(entry.phi);
        resolve.hidden = false;
        resolve.scrollIntoView({ behavior: "smooth", block: "start" });
      };

      const showResolveContinue = (entry, session, chain, nextEl) => {
        game.hidden = true;
        const nextUrl = nextEl ? PAGE(nextEl) + "?s=" + session.session_id : null;
        let tail;
        if (nextUrl) {
          tail = '<p style="margin:0 0 1.2em;"><a class="door-link" href="' + nextUrl + '"><em>Carry it to ' + nextEl + ' →</em></a></p>' +
                 '<p style="font-style:italic;opacity:0.78;">The current moves on — ' + nextEl + ' is next in the relay.</p>';
        } else {
          tail = '<p style="font-style:italic;opacity:0.78;">All six elements have read it. Aether now composes the synthesis — the Sunday strategic report.</p>';
        }
        resolve.innerHTML =
          '<p class="label">' + El + '’s reading — added to the chain</p>' +
          '<p class="phi">' + esc(entry.phi) + '</p>' +
          '<p class="reading">' + esc(entry.reading) + '</p>' +
          '<p class="label" style="margin-top:1em;">the chain so far</p>' +
          '<p class="chain">' + esc(chainPhi(chain)) + '</p>' + tail;
        if (nextUrl) wireCopy(entry.phi, true);
        resolve.hidden = false;
        resolve.scrollIntoView({ behavior: "smooth", block: "start" });
      };

      function wireCopy(phi) {
        const btn = resolve.querySelector(".copy-btn");
        if (btn) btn.addEventListener("click", function () {
          navigator.clipboard && navigator.clipboard.writeText(phi);
          this.textContent = "copied ✓";
        });
      }

      if (sid) {
        // CONTINUE mode
        cont({
          element: El, sessionId: sid, mount: game,
          onMissing: () => { incoming.innerHTML =
            '<p class="from">That current hasn’t settled here yet, or the link is incomplete. Give it a moment and refresh — a handoff can take a few seconds to arrive.</p>';
            incoming.hidden = false; },
          onMismatch: (session, who) => {
            incoming.innerHTML = who === "complete"
              ? '<p class="from">This reading is already complete — all six elements have read it.</p>'
              : '<p class="from">This current is waiting for <strong>' + who + '</strong>, not ' + El + '.</p>' +
                '<p style="margin-top:1em;"><a class="door-link" href="' + PAGE(who) + "?s=" + esc(sid) + '"><em>Take it to ' + who + " →</em></a></p>";
            incoming.hidden = false;
          },
          onIncoming: session => {
            const last = session.chain[session.chain.length - 1];
            incoming.innerHTML =
              '<p class="from">a current arrived from ' + last.element + " — “" + esc(session.title) + "”</p>" +
              '<p class="phi">' + esc(last.phi) + "</p>" +
              '<p class="reading">' + esc(last.reading) + "</p>";
            incoming.hidden = false;
            game.hidden = false;
          },
          onComplete: showResolveContinue
        });
      } else {
        // START mode — name the situation, then play
        intro.innerHTML =
          '<div style="padding:1vh 0 5vh;">' +
          '<label for="title" style="display:block;font-style:italic;margin:0 0 0.7em;">Name the situation <span style="opacity:0.55;">(optional)</span></label>' +
          '<input type="text" id="title" placeholder="the strategy or situation you\'re reading" ' +
          'style="width:100%;background:transparent;border:0;border-bottom:1px solid rgba(31,42,46,0.28);padding:0.4em 0;font-family:inherit;font-size:1em;color:var(--ink);">' +
          '<p style="margin:2.4em 0 0;"><button type="button" id="begin" class="door-link" style="background:none;border:0;border-bottom:1px solid var(--accent);cursor:pointer;"><em>Begin with ' + El + ' →</em></button></p></div>';
        intro.hidden = false;
        q("#begin").addEventListener("click", () => {
          const title = (q("#title") || {}).value || "";
          intro.hidden = true; game.hidden = false;
          start({ element: El, mount: game, title: title, onComplete: showResolveStart });
        });
      }
    });
  }

  return { page, start, cont, taxonomy, elementByName, chainPhi, ORDER, ENDPOINT };
})();
