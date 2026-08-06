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
  // The same six voices at the near scales — the operator is unchanged, the register is not.
  const BLURB_REL = {
    Air: "Air sees first — it separates what is actually here from the story already told about it.",
    Water: "Water feels the field — who this touches, what is owed, where trust holds or thins.",
    Fire: "Fire gives it direction — where this is heading, and what the crossing would cost.",
    Wood: "Wood opens what's next — what is trying to grow, before the shape is fixed.",
    Earth: "Earth weighs what it costs — what you are carrying, and what would actually feed it.",
    Metal: "Metal holds the form — the edges that keep this whole without sealing it."
  };
  const PAGE = el => el.toLowerCase() + ".html";
  const rotated = element => {
    const i = ORDER.indexOf(element);
    return ORDER.slice(i).concat(ORDER.slice(0, i));
  };

  // Each element's rebuilt ChatGPT GPT (the "take it deeper" door).
  const GPT_URL = {
    Air: "https://chatgpt.com/g/g-69459eaf0f94819184704a5da2d2c933-air",
    Water: "https://chatgpt.com/g/g-6945d5a97570819191173ba622f7dad5-water",
    Fire: "https://chatgpt.com/g/g-6945daa59cd88191a673ba5bbf16ffdc-fire",
    Wood: "https://chatgpt.com/g/g-6945c5ca80608191a88b82c365342f9f-wood",
    Earth: "https://chatgpt.com/g/g-6945d7402b288191a2c57d49174c5a6a-earth",
    Metal: "https://chatgpt.com/g/g-6945d80679488191ae01c674a88d58ae-metal"
  };
  const DISCORD_INVITE = "https://discord.gg/uBSMGS7Hzr";

  // Optional context the reader can name before the walk. Both are deliberately ORTHOGONAL to
  // the taxonomy (sub-domain → facet → stance) the element is about to walk — they say where the
  // situation sits and what shape it has, which the tree never asks and the guide can't infer.
  // SCOPE follows the framework's nested habitats; TURNING uses the site's own vocabulary
  // ("a decision, a season, a stuck place" — accounts).
  const SCOPES = [
    "just me", "me and one other", "a team or group",
    "an organization", "a field or community", "something in the world"
  ];
  const TURNINGS = [
    "a decision I'm facing", "a stuck place", "a conflict",
    "a transition or ending", "something I'm watching unfold", "not sure yet"
  ];

  // The relay session carries ONE free field (`title`) end to end, so scope and turning are
  // folded into it — otherwise they'd be lost the moment the next element picks the reading up.
  function composeTitle(text, scope, turning) {
    const qualifiers = [turning, scope].filter(Boolean).join(" · ");
    text = (text || "").trim();
    if (text && qualifiers) return text + " (" + qualifiers + ")";
    return text || qualifiers;
  }

  // ---- tracks -------------------------------------------------------------------------
  // The relay is the mechanism; the TRACK is which facet vocabulary it walks. Scope picks it:
  // the near scales read on the relational track, the far ones on the strategic (PESTLE) one.
  // The operators are identical across both, so φ, chains and the synthesis read across them.
  const TRACK_BY_SCOPE = {
    "just me": "relational",
    "me and one other": "relational",
    "a team or group": "relational",
    "an organization": "strategic",
    "a field or community": "strategic",
    "something in the world": "strategic"
  };
  const TRACK_FILE = { strategic: "taxonomy.json", relational: "taxonomy-relational.json" };
  const trackFor = scope => TRACK_BY_SCOPE[scope] || "strategic";

  // A continuing element only receives `title` from the session, so the track is recovered from
  // the qualifiers composeTitle() folded in — the same reason scope lives there in the first place.
  // Only exact matches against SCOPES count, so a reader's own parentheses can't be misread.
  function scopeFromTitle(title) {
    const m = /\(([^()]*)\)\s*$/.exec(title || "");
    if (!m) return "";
    const parts = m[1].split("·").map(s => s.trim());
    for (let i = 0; i < parts.length; i++) if (SCOPES.indexOf(parts[i]) > -1) return parts[i];
    return "";
  }
  const trackFromTitle = title => trackFor(scopeFromTitle(title));

  let TAX = null, TRACK = null;
  const taxonomy = track => {
    track = track || TRACK || "strategic";
    if (TAX && TRACK === track) return Promise.resolve(TAX);
    return fetch(TRACK_FILE[track] || TRACK_FILE.strategic)
      .then(r => r.json()).then(t => { TAX = t; TRACK = track; return t; });
  };
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
  const opt = (v, t) => '<option value="' + esc(v) + '">' + esc(t) + "</option>";

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
  // Three dependent selects rather than three one-way doors. The old walk committed on click
  // and cleared the mount, so a reader chose a sub-domain before seeing what was inside it and
  // could not go back. Here every level stays open and revisable, the whole tree is browsable
  // before committing, and nothing is cut until the reader says so.
  function playElement(mount, elementName) {
    const element = elementByName(elementName);
    return new Promise(resolve => {
      clear(mount);
      const all = element.branches.map(b =>
        "<li><strong>" + esc(b.title) + "</strong><ul>" +
        b.facets.map(f => "<li>" + esc(f.text) + "</li>").join("") + "</ul></li>").join("");
      mount.innerHTML =
        '<p class="cyoa-framing">' + esc(element.diagnostic.core_question) + "</p>" +
        '<div class="walk">' +
          '<div class="walk-field"><label class="sit-label" for="w-branch">Where does this sit?</label>' +
            '<span class="sit-select-wrap"><select class="sit-select" id="w-branch">' +
            element.branches.map((b, i) => opt(i, b.title)).join("") + "</select></span></div>" +
          '<div class="walk-field"><label class="sit-label" for="w-facet">What’s live within it?</label>' +
            '<span class="sit-select-wrap"><select class="sit-select" id="w-facet"></select></span></div>' +
          '<div class="walk-field"><label class="sit-label" for="w-stance">How is it live right now?</label>' +
            '<span class="sit-select-wrap"><select class="sit-select" id="w-stance">' +
            TAX.stances.map(s => opt(s.id, s.label)).join("") + "</select></span></div>" +
        "</div>" +
        '<p class="walk-gloss" id="w-gloss"></p>' +
        '<details class="walk-all"><summary>see all nine at once</summary><ul>' + all + "</ul></details>" +
        '<p class="walk-preview">this cuts <code id="w-phi"></code></p>' +
        '<p style="margin:1.6em 0 0;"><button type="button" id="w-cut" class="door-link" ' +
        'style="background:none;border:0;border-bottom:1px solid var(--accent);cursor:pointer;">' +
        "<em>Cut the line →</em></button></p>";

      const bSel = mount.querySelector("#w-branch"), fSel = mount.querySelector("#w-facet"),
            sSel = mount.querySelector("#w-stance"), gloss = mount.querySelector("#w-gloss"),
            phiEl = mount.querySelector("#w-phi");
      const branchOf = () => element.branches[bSel.value | 0];
      const facetOf = () => branchOf().facets[fSel.value | 0];

      function fillFacets() {
        fSel.innerHTML = branchOf().facets.map((f, i) => opt(i, f.text)).join("");
      }
      function reflect() {
        gloss.textContent = element.stance_frames[sSel.value] || "";
        phiEl.textContent = element.operator + "(" + facetOf().id + " | " + sSel.value + ")";
      }
      bSel.addEventListener("change", () => { fillFacets(); reflect(); });
      fSel.addEventListener("change", reflect);
      sSel.addEventListener("change", reflect);
      fillFacets(); reflect();

      mount.querySelector("#w-cut").addEventListener("click", () =>
        resolve(compileLeaf(element, branchOf(), facetOf(), sSel.value)));
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
  const enrichingOf = s => (s.status && s.status.indexOf("enriching:") === 0) ? s.status.split(":")[1] : null;
  function enrich(sessionId, text, email, share, discord) {
    return post({ action: "enrich", session_id: sessionId, enrichment: text,
                  notify_email: email || "", share: share ? "true" : "",
                  discord: (discord || "").replace(/^@/, "") });
  }

  // ---- core flows ---------------------------------------------------------------------

  // START — element seeds a new session; order is the rotation beginning at it. After the CYOA
  // the session sits at `enriching:<el>` — the handoff is gated on the GPT enrichment.
  function start(opts) {
    return taxonomy(opts.track || trackFromTitle(opts.title)).then(() => playElement(opts.mount, opts.element)).then(entry => {
      const sessionId = uuid();
      const order = (opts.order || rotated(opts.element)).slice();
      const title = (opts.title && opts.title.trim()) ||
        (entry.element + " reads " + entry.facet_id.replace(/_/g, " "));
      post({ action: "start", session_id: sessionId, title: title,
             order: JSON.stringify(order), entry: JSON.stringify(entry) });
      opts.onComplete(entry, sessionId, order, [entry], title);
    });
  }

  // CONTINUE — load a session reached via a Discord unlock link. Four cases by status:
  //  awaiting:thisEl   → play THIS element's tree (its turn), then deepen+enrich
  //  enriching:thisEl  → already played; resume at the deepen+enrich step (don't replay)
  //  awaiting/enriching:other → not this element's turn (out-of-order guard)
  //  complete          → done
  function cont(opts) {
    // Session first: its title is what tells us which track this relay is walking.
    return getSession(opts.sessionId).then(session => {
      if (!session) { opts.onMissing && opts.onMissing(); return; }
      return taxonomy(trackFromTitle(session.title)).then(() => session);
    }).then(session => {
      if (!session) return;
      if (session.status === "complete") { opts.onMismatch && opts.onMismatch(session, "complete"); return; }
      const awaiting = awaitingOf(session), enriching = enrichingOf(session);
      if (enriching === opts.element) { opts.onResume && opts.onResume(session); return; }
      const busy = enriching || awaiting;
      if (busy && busy !== opts.element) { opts.onMismatch && opts.onMismatch(session, busy); return; }
      if (opts.onIncoming) opts.onIncoming(session);
      return playElement(opts.mount, opts.element).then(entry => {
        post({ action: "advance", session_id: opts.sessionId, entry: JSON.stringify(entry) });
        const chain = session.chain.concat([entry]);
        opts.onComplete(entry, opts.sessionId, session.order, chain, session.title);
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

      // Re-rendered when scope changes the track: the question and the orientation are the
      // reader's first sign that the instrument has changed register.
      function renderHead() {
        const el = elementByName(opts.element);
        head.innerHTML =
          '<span class="element-mark" aria-hidden="true">' + el.operator + '</span>' +
          '<p class="eyebrow">a relay · ' + (sid ? "continues" : "begins") + " with " + El.toLowerCase() + '</p>' +
          '<h1>' + esc(el.diagnostic.core_question) + '</h1>' +
          '<p class="orientation">' + esc((TRACK === "relational" ? BLURB_REL : BLURB)[El]) + '</p>' +
          (sid ? "" :
            '<p class="orientation">A decision, a knot, a turning — anything you’re trying to read clearly, ' +
            'one lens at a time. Walk three choices; ' + El + ' cuts one line — a <em>nemetic.φ</em> — to take ' +
            'deeper with the guide, then hand on. Six elements carry it in turn, and a synthesis at the end.</p>');
      }
      renderHead();

      function wireCopy(phi) {
        const btn = resolve.querySelector(".copy-btn");
        if (btn) btn.addEventListener("click", function () {
          navigator.clipboard && navigator.clipboard.writeText(phi);
          this.textContent = "copied ✓";
        });
      }

      const TEXTAREA_STYLE = "width:100%;background:transparent;color:var(--ink);border:0;" +
        "border-bottom:1px solid var(--hairline);padding:0.4em 0.55em;font-family:var(--font-scribe);" +
        "font-size:0.82em;line-height:1.5;resize:vertical;min-height:6.5em;";

      // φ + (chain) + the "take it deeper" GPT door + the paste-back field. On paste-back →
      // enrich → the Discord-only funnel (no on-page next-link — the unlock lives in Discord).
      function showResolve(entry, sessionId, order, chain, title) {
        game.hidden = true;
        const isLast = chain.length >= order.length;
        const nextEl = isLast ? null : order[chain.length];
        const situation = (title || "").trim();
        // what the participant pastes into the GPT — the φ AND the situation they named, so the
        // guide has the context (fixes the dropped first-box).
        // What the reader pastes into the guide. The φ alone strands the guide: it can't see the
        // situation or what the earlier elements already found. The whole chain goes across.
        const handoff = [
          situation ? "The situation I'm reading: " + situation : null,
          chain.length > 1 ? "The chain so far: " + chainPhi(chain) : null,
          El + "’s line: " + entry.phi,
          "Which reads: " + entry.reading,
          "",
          "Take this as far as " + El + " can, then give me what I should carry forward to elemental.fyi."
        ].filter(v => v !== null).join("\n");
        let html =
          '<p class="label">' + El + "’s reading — your φ</p>" +
          '<p class="phi">' + esc(entry.phi) + "</p>" +
          '<p class="reading">' + esc(entry.reading) + "</p>";
        if (chain.length > 1)
          html += '<p class="label" style="margin-top:1.2em;">the chain so far</p>' +
                  '<p class="chain">' + esc(chainPhi(chain)) + "</p>";
        html +=
          '<p class="label" style="margin-top:2em;">take it deeper</p>' +
          '<p style="margin:0 0 1.2em;">Bring this to ' + El + ' and let it teach you. <strong>Take your time</strong> — sit with it, go back and forth a few times; this is contemplation, not a quiz, and it can run as long as you like. When you’re ready, ask it: <em>“Provide what I should carry forward to elemental.fyi.”</em> It will hand back a short <em>carry-forward</em> block — paste that back here to hand the reading on.</p>' +
          '<p style="margin:0 0 1.4em;"><a class="door-link" href="' + GPT_URL[El] + '" target="_blank" rel="noopener"><em>Take it deeper with ' + El + ' →</em></a></p>' +
          '<p class="label" style="margin-top:1.6em;">what to paste to ' + El + '</p>' +
          '<pre class="handoff-block" id="handoff-src">' + esc(handoff) + "</pre>" +
          '<div class="copy-row"><button type="button" class="copy-btn">copy the whole handoff</button>' +
          '<span style="opacity:0.6;">— the situation, the chain so far, and this element’s line</span></div>' +
          '<div style="margin-top:2.2em;">' +
          '<label for="enrich-box" style="display:block;font-style:italic;margin:0 0 0.7em;">Paste what ' + El + ' gave you</label>' +
          '<textarea id="enrich-box" rows="6" placeholder="the ─── CARRY FORWARD ─── block ' + El + ' ended with…" style="' + TEXTAREA_STYLE + '"></textarea>' +
          '<label for="enrich-email" style="display:block;font-style:italic;margin:1.6em 0 0.4em;">Where should we send your way back?</label>' +
          '<p style="font-size:0.84em;opacity:0.7;margin:0 0 0.6em;">Optional, but recommended — it’s how you find your way back to continue, and where a link will reach you.</p>' +
          '<input type="email" id="enrich-email" placeholder="you@somewhere" style="width:100%;background:transparent;border:0;border-bottom:1px solid var(--hairline);padding:0.4em 0.55em;font-family:inherit;font-size:1em;color:var(--ink);">' +
          '<label for="enrich-discord" style="display:block;font-style:italic;margin:1.4em 0 0.4em;">Your Discord name, if you have one there</label>' +
          '<p style="font-size:0.84em;opacity:0.7;margin:0 0 0.6em;">Optional — it’s how the community tally knows who carried this reading. Never shown publicly.</p>' +
          '<input type="text" id="enrich-discord" placeholder="yourhandle" maxlength="60" autocomplete="off" style="width:100%;background:transparent;border:0;border-bottom:1px solid var(--hairline);padding:0.4em 0.55em;font-family:inherit;font-size:1em;color:var(--ink);">' +
          '<label for="enrich-share" style="display:flex;gap:0.6em;align-items:flex-start;font-style:normal;cursor:pointer;margin:1.8em 0 0;">' +
          '<input type="checkbox" id="enrich-share" style="margin-top:0.4em;">' +
          '<span style="font-size:0.9em;opacity:0.82;">Include <em>your own words</em> when ' + El + ' voices the handoff in the community Discord. <em>Off by default: the reading still travels — the handoff posts either way — but what you wrote stays private.</em></span></label>' +
          '<p style="margin:2em 0 0;"><button type="button" id="enrich-btn" class="door-link" style="background:none;border:0;border-bottom:1px solid var(--accent);cursor:pointer;"><em>' +
          (isLast ? "Complete the reading →" : "Hand it forward →") + '</em></button></p></div>';
        resolve.innerHTML = html;
        wireCopy(handoff);
        q("#enrich-btn").addEventListener("click", () => {
          const box = q("#enrich-box");
          const txt = ((box && box.value) || "").trim();
          if (!txt) { box && box.focus(); return; }
          const email = ((q("#enrich-email") || {}).value || "").trim();
          const discord = ((q("#enrich-discord") || {}).value || "").trim();
          const share = !!(q("#enrich-share") && q("#enrich-share").checked);
          enrich(sessionId, txt, email, share, discord);
          showFunnel(nextEl, isLast, email, sessionId, share, order);
        });
        resolve.hidden = false;
        // account attach (progressive): a signed-in reader keeps the reading automatically;
        // a signed-out one gets a one-line invitation. No-ops if auth.js isn't on the page.
        if (window.ElementalAuth) {
          if (window.ElementalAuth.user()) {
            window.ElementalAuth.saveReading(sessionId, situation, chainPhi(chain));
          } else {
            const keep = document.createElement("p");
            keep.style.cssText = "font-size:0.84em;opacity:0.72;margin:1.6em 0 0;font-style:italic;";
            keep.innerHTML = 'Keep this reading — <a href="#">sign in</a> and it stays yours across visits.';
            keep.querySelector("a").addEventListener("click", function (e) {
              e.preventDefault(); window.ElementalAuth.open();
            });
            resolve.appendChild(keep);
          }
        }
        resolve.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      function showFunnel(nextEl, isLast, email, sessionId, share, order) {
        const mailLine = email ? " We’ll email <strong>" + esc(email) + "</strong> the link." : "";
        const nextUrl = (!isLast && nextEl) ? PAGE(nextEl) + "?s=" + sessionId : null;
        if (isLast) {
          // truthful path summary — a session's order may be shorter than the full six
          const path = (order && order.length) ? order.join(" → ") : null;
          const pathLine = path
            ? "Its path — <strong>" + esc(path) + "</strong> — is fully read."
            : "Every element on its path has read it.";
          resolve.innerHTML =
            '<p class="label">the reading is complete</p>' +
            '<p>' + pathLine + ' The full chain goes to Aether now — the Sunday synthesis.' + mailLine + '</p>' +
            // the commons: readings live among people, and carrying one counts
            '<p style="margin-top:1.8em;">Readings like this one travel through a small community, hand to hand — the elementals voice each handoff there, and completed relays earn a place on your <a href="../account.html" style="color:inherit;">tally</a>.</p>' +
            '<p style="margin-top:0.9em;"><a class="door-link" href="' + DISCORD_INVITE + '" target="_blank" rel="noopener"><em>' +
            (share ? 'See where it lands in the Discord →' : 'Step into the commons →') + '</em></a></p>';
        } else if (share) {
          resolve.innerHTML =
            '<p class="label">carried to ' + El + '’s channel</p>' +
            '<p>' + El + ' is taking this as far as it can. <strong>Within the hour</strong>, ' + El + '’s voice posts in the Discord — your φ and what you found — inviting someone to carry it to <strong>' + nextEl + '</strong>.' + mailLine + '</p>' +
            '<p style="font-style:italic;opacity:0.7;font-size:0.92em;margin:1.2em 0 0;">The pause is the point — a reading should travel slowly, and sometimes through someone else.</p>' +
            '<p style="margin-top:1.8em;"><a class="door-link" href="' + DISCORD_INVITE + '" target="_blank" rel="noopener"><em>Join the Discord to follow it →</em></a></p>';
        } else {
          resolve.innerHTML =
            '<p class="label">your words stay private — the reading travels</p>' +
            '<p><strong>Within the hour</strong>, ' + El + '’s voice posts the handoff in the Discord — the reading itself and an invitation to carry it to <strong>' + nextEl + '</strong> — but <em>your own words go with no one</em>. They stay here, yours.' + mailLine + '</p>' +
            (nextUrl ? '<p style="margin-top:1.8em;"><a class="door-link" href="' + nextUrl + '"><em>Or carry it to ' + nextEl + ' yourself →</em></a></p>' : '') +
            '<p style="font-style:italic;opacity:0.7;font-size:0.9em;margin:1.2em 0 0;">You can hand that link to someone else too — a reading is meant to travel.</p>';
        }
        resolve.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      const showIncoming = session => {
        const last = session.chain[session.chain.length - 1];
        incoming.innerHTML =
          // orientation for someone arriving cold (e.g. from a Discord handoff link)
          '<p class="from" style="opacity:0.65;font-size:0.88em;">You’ve picked up a traveling reading — one situation, read by one element at a time, each handing forward what it found. ' +
          esc(last.element) + ' has done its part; <strong>' + El + '</strong> reads next. Take it deeper with the guide below, then paste back the carry-forward to hand it on.</p>' +
          '<p class="from">a current arrived from ' + esc(last.element) + " — “" + esc(session.title) + "”</p>" +
          '<p class="phi">' + esc(last.phi) + "</p>" +
          (last.reading ? '<p class="reading">' + esc(last.reading) + "</p>" : "") +
          (last.enrichment ? '<p class="reading" style="margin-top:0.7em;opacity:0.8;">' + esc(last.enrichment) + "</p>" : "");
        incoming.hidden = false;
      };

      if (sid) {
        cont({
          element: El, sessionId: sid, mount: game,
          onMissing: () => { incoming.innerHTML =
            '<p class="from">That current hasn’t settled here yet, or the link is incomplete. Give it a little while and refresh — a handoff can take a moment to arrive.</p>';
            incoming.hidden = false; },
          onMismatch: (session, who) => {
            incoming.innerHTML = who === "complete"
              ? '<p class="from">This reading is already complete — it has traveled its full path.</p>'
              : '<p class="from">This current is with <strong>' + who + '</strong> right now, not ' + El + '.</p>' +
                '<p style="margin-top:1em;"><a class="door-link" href="' + PAGE(who) + "?s=" + esc(sid) + '"><em>Go to ' + who + " →</em></a></p>";
            incoming.hidden = false;
          },
          onResume: session => {     // came back during enriching:thisEl — resume the deepen step
            renderHead();            // the track is known now; the head may have been the wrong register
            if (session.chain.length > 1)
              showIncoming({ chain: session.chain.slice(0, -1), title: session.title });
            const last = session.chain[session.chain.length - 1];
            showResolve(last, sid, session.order, session.chain, session.title);
          },
          onIncoming: session => { renderHead(); showIncoming(session); game.hidden = false; },
          onComplete: (entry, sessionId, order, chain, title) => showResolve(entry, sessionId, order, chain, title)
        });
      } else {
        var HINT_REST = "A short label and, if it helps, where this sits and what shape it has. Whatever you give travels with the relay, into each element and the handoff. <em>Where</em> also sets the register the lenses read in — the near scales relationally, the far ones strategically.";
        var optionTags = list => list.map(v => '<option value="' + esc(v) + '">' + esc(v) + "</option>").join("");
        intro.innerHTML =
          '<div class="sit-block">' +
          '<label class="sit-label" for="title">Name the situation <span class="opt">(optional)</span></label>' +
          '<input class="sit-input" type="text" id="title" placeholder="the strategy or situation you\'re reading" autocomplete="off">' +
          '<div class="sit-pair">' +
            '<div><label class="sit-label" for="sit-scope">Where is this happening? <span class="opt">(optional)</span></label>' +
            '<span class="sit-select-wrap"><select class="sit-select" id="sit-scope">' +
            '<option value="">—</option>' + optionTags(SCOPES) + "</select></span></div>" +
            '<div><label class="sit-label" for="sit-turning">What kind of turning is this? <span class="opt">(optional)</span></label>' +
            '<span class="sit-select-wrap"><select class="sit-select" id="sit-turning">' +
            '<option value="">—</option>' + optionTags(TURNINGS) + "</select></span></div>" +
          "</div>" +
          '<p id="title-hint" class="sit-hint">' + HINT_REST + "</p>" +
          '<p style="margin:2.2em 0 0;"><button type="button" id="begin" class="door-link" style="background:none;border:0;border-bottom:1px solid var(--accent);cursor:pointer;"><em>Begin with ' + El + ' →</em></button></p></div>';
        intro.hidden = false;
        var titleEl = q("#title"), titleHint = q("#title-hint"),
            scopeEl = q("#sit-scope"), turnEl = q("#sit-turning");
        // live affordance — once they name it, confirm what will be carried, not lost
        function reflect() {
          var v = composeTitle(titleEl.value, scopeEl.value, turnEl.value);
          if (v) {
            var reg = scopeEl.value ? " Read in the <strong>" + trackFor(scopeEl.value) + "</strong> register." : "";
            titleHint.innerHTML = "✓ Noted — “" + esc(v) + "” carries through your relay, into each element and the guide handoff." + reg;
            titleHint.style.color = "var(--accent)"; titleHint.style.opacity = "0.95"; titleHint.style.fontStyle = "normal";
          } else {
            titleHint.innerHTML = HINT_REST;
            titleHint.style.color = ""; titleHint.style.opacity = "0.6"; titleHint.style.fontStyle = "italic";
          }
        }
        titleEl.addEventListener("input", reflect);
        // Scope is load-bearing: it selects which facet vocabulary this relay walks.
        scopeEl.addEventListener("change", () => {
          reflect();
          const want = trackFor(scopeEl.value);
          if (want !== TRACK) taxonomy(want).then(renderHead);
        });
        turnEl.addEventListener("change", reflect);
        q("#begin").addEventListener("click", () => {
          const title = composeTitle(titleEl.value, scopeEl.value, turnEl.value);
          // keep the named situation on screen as the reading proceeds — proof it carried over
          intro.innerHTML = title
            ? '<p style="font-size:0.86em;font-style:italic;opacity:0.72;margin:0 0 1.6em;border-left:2px solid var(--accent);padding-left:0.8em;">reading: ' + esc(title) + '</p>'
            : "";
          intro.hidden = !title; game.hidden = false;
          start({ element: El, mount: game, title: title, track: trackFor(scopeEl.value),
                  onComplete: (entry, sessionId, order, chain, t) => showResolve(entry, sessionId, order, chain, t) });
        });
      }
    });
  }

  return { page, start, cont, taxonomy, elementByName, chainPhi, ORDER, ENDPOINT };
})();
