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
    return taxonomy().then(() => playElement(opts.mount, opts.element)).then(entry => {
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
    return taxonomy().then(() => getSession(opts.sessionId)).then(session => {
      if (!session) { opts.onMissing && opts.onMissing(); return; }
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

      head.innerHTML =
        '<span class="element-mark" aria-hidden="true">' + element.operator + '</span>' +
        '<p class="eyebrow">a reading · ' + (sid ? "continues" : "begins") + " with " + El.toLowerCase() + '</p>' +
        '<h1>' + esc(element.diagnostic.core_question) + '</h1>' +
        '<p class="orientation">' + esc(BLURB[El]) + '</p>' +
        (sid ? "" :
          '<p class="orientation">A decision, a situation, a strategy — anything you’re trying to read clearly, ' +
          'one lens at a time. Walk three choices; ' + El + ' cuts one line — a <em>nemetic.φ</em> — to take ' +
          'deeper with the guide, then hand on. Six elements, and a synthesis at the end.</p>');

      function wireCopy(phi) {
        const btn = resolve.querySelector(".copy-btn");
        if (btn) btn.addEventListener("click", function () {
          navigator.clipboard && navigator.clipboard.writeText(phi);
          this.textContent = "copied ✓";
        });
      }

      const TEXTAREA_STYLE = "width:100%;background:transparent;color:var(--ink);border:0;" +
        "border-bottom:1px solid rgba(31,42,46,0.28);padding:0.4em 0.55em;font-family:'SFMono-Regular','Menlo',monospace;" +
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
        const handoff = entry.phi + (situation ? "\n\nThe situation I'm reading: " + situation : "");
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
          '<div class="copy-row"><span>paste this to ' + El + ':</span><code>' + esc(entry.phi) + '</code><button type="button" class="copy-btn">copy</button></div>' +
          (situation ? '<p style="font-size:0.84em;opacity:0.65;margin:0.5em 0 0;">(the copy carries your situation too: “' + esc(situation) + '”)</p>' : "") +
          '<div style="margin-top:2.2em;">' +
          '<label for="enrich-box" style="display:block;font-style:italic;margin:0 0 0.7em;">Paste what ' + El + ' gave you</label>' +
          '<textarea id="enrich-box" rows="6" placeholder="the ─── CARRY FORWARD ─── block ' + El + ' ended with…" style="' + TEXTAREA_STYLE + '"></textarea>' +
          '<label for="enrich-email" style="display:block;font-style:italic;margin:1.6em 0 0.4em;">Where should we send your way back?</label>' +
          '<p style="font-size:0.84em;opacity:0.7;margin:0 0 0.6em;">Optional, but recommended — it’s how you find your way back to continue, and where a link will reach you.</p>' +
          '<input type="email" id="enrich-email" placeholder="you@somewhere" style="width:100%;background:transparent;border:0;border-bottom:1px solid rgba(31,42,46,0.28);padding:0.4em 0.55em;font-family:inherit;font-size:1em;color:var(--ink);">' +
          '<label for="enrich-discord" style="display:block;font-style:italic;margin:1.4em 0 0.4em;">Your Discord name, if you have one there</label>' +
          '<p style="font-size:0.84em;opacity:0.7;margin:0 0 0.6em;">Optional — it’s how the community tally knows who carried this reading. Never shown publicly.</p>' +
          '<input type="text" id="enrich-discord" placeholder="yourhandle" maxlength="60" autocomplete="off" style="width:100%;background:transparent;border:0;border-bottom:1px solid rgba(31,42,46,0.28);padding:0.4em 0.55em;font-family:inherit;font-size:1em;color:var(--ink);">' +
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
            (share ? '<p style="margin-top:1.8em;"><a class="door-link" href="' + DISCORD_INVITE + '" target="_blank" rel="noopener"><em>See where it lands in the Discord →</em></a></p>' : '');
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
            if (session.chain.length > 1)
              showIncoming({ chain: session.chain.slice(0, -1), title: session.title });
            const last = session.chain[session.chain.length - 1];
            showResolve(last, sid, session.order, session.chain, session.title);
          },
          onIncoming: session => { showIncoming(session); game.hidden = false; },
          onComplete: (entry, sessionId, order, chain, title) => showResolve(entry, sessionId, order, chain, title)
        });
      } else {
        var HINT_REST = "A short label, just so you and the guide know what you’re reading — it travels with the reading, into each element and the handoff.";
        intro.innerHTML =
          '<div style="padding:1vh 0 5vh;">' +
          '<label for="title" style="display:block;font-style:italic;margin:0 0 0.7em;">Name the situation <span style="opacity:0.55;">(optional)</span></label>' +
          '<input type="text" id="title" placeholder="the strategy or situation you\'re reading" autocomplete="off" ' +
          'style="width:100%;background:transparent;border:0;border-bottom:1px solid rgba(31,42,46,0.28);padding:0.4em 0.55em;font-family:inherit;font-size:1em;color:var(--ink);">' +
          '<p id="title-hint" style="font-size:0.85em;line-height:1.45;font-style:italic;opacity:0.6;margin:0.7em 0 0;transition:opacity 0.15s,color 0.15s;">' + HINT_REST + '</p>' +
          '<p style="margin:2.2em 0 0;"><button type="button" id="begin" class="door-link" style="background:none;border:0;border-bottom:1px solid var(--accent);cursor:pointer;"><em>Begin with ' + El + ' →</em></button></p></div>';
        intro.hidden = false;
        var titleEl = q("#title"), titleHint = q("#title-hint");
        // live affordance — once they name it, confirm it will be carried, not lost
        titleEl.addEventListener("input", function () {
          var v = titleEl.value.trim();
          if (v) {
            titleHint.innerHTML = "✓ Noted — “" + esc(v) + "” carries through your reading, into each element and the guide handoff.";
            titleHint.style.color = "var(--accent)"; titleHint.style.opacity = "0.95"; titleHint.style.fontStyle = "normal";
          } else {
            titleHint.textContent = HINT_REST;
            titleHint.style.color = ""; titleHint.style.opacity = "0.6"; titleHint.style.fontStyle = "italic";
          }
        });
        q("#begin").addEventListener("click", () => {
          const title = (titleEl.value || "").trim();
          // keep the named situation on screen as the reading proceeds — proof it carried over
          intro.innerHTML = title
            ? '<p style="font-size:0.86em;font-style:italic;opacity:0.72;margin:0 0 1.6em;border-left:2px solid var(--accent);padding-left:0.8em;">reading: ' + esc(title) + '</p>'
            : "";
          intro.hidden = !title; game.hidden = false;
          start({ element: El, mount: game, title: title,
                  onComplete: (entry, sessionId, order, chain, t) => showResolve(entry, sessionId, order, chain, t) });
        });
      }
    });
  }

  return { page, start, cont, taxonomy, elementByName, chainPhi, ORDER, ENDPOINT };
})();
