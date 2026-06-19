/* Retrieval page — pick a movement → drill the area → get the ready-to-run search prompt.
 *
 * Fully static: looks the prompt up from the pre-built corpus (transitions_prompts.json) and
 * substitutes {{AREA}} with the drilldown's field phrase. No backend. The transition can arrive
 * from a relay handoff (?t=Fire-Wood) or be picked here in plain, non-elemental language.
 */
window.RETRIEVE = (function () {
  const ORDER = ["Air", "Water", "Fire", "Wood", "Earth", "Metal"];
  // the six element-states in plain language, voiced per scale — the surface never names the elements.
  // Personal = an individual · Local = a group/place · Global = a society/system. Same six underlying
  // states; only the register changes. The prompt library keys on the element, NOT the label, so these
  // are purely a surface choice (re-voicing is free — no corpus regeneration).
  const STATE_BY_SCALE = {
    personal: {
      Air:   { label: "Clear-eyed",   gloss: "seeing, naming, making distinctions" },
      Water: { label: "Connected",    gloss: "feeling, attuned, close to something" },
      Fire:  { label: "Driven",       gloss: "aimed, committed, moving toward something" },
      Wood:  { label: "Open",         gloss: "exploring, playing with what could be" },
      Earth: { label: "Grounded",     gloss: "sustaining, maintaining, keeping going" },
      Metal: { label: "Holding form", gloss: "keeping a boundary, a rule, a structure" }
    },
    local: {
      Air:   { label: "Seeing it plainly", gloss: "the group reads and names what's really going on" },
      Water: { label: "Close-knit",        gloss: "bound by trust and belonging" },
      Fire:  { label: "Mobilized",         gloss: "rallied and moving toward something" },
      Wood:  { label: "Experimenting",     gloss: "trying new ways of being together" },
      Earth: { label: "Self-sustaining",   gloss: "keeping itself fed and going" },
      Metal: { label: "Holding its shape", gloss: "kept by roles, rules, and boundaries" }
    },
    global: {
      Air:   { label: "Made legible",     gloss: "seen, measured, named in public" },
      Water: { label: "Bound by trust",   gloss: "held by shared legitimacy and belonging" },
      Fire:  { label: "In transformation", gloss: "momentum, conflict, a push to change" },
      Wood:  { label: "In ferment",       gloss: "new forms and possibilities branching" },
      Earth: { label: "Resourced",        gloss: "fed and maintained by its material base" },
      Metal: { label: "Codified",         gloss: "held by law, institutions, and structure" }
    }
  };
  const GPT_URL = {
    Air: "https://chatgpt.com/g/g-69459eaf0f94819184704a5da2d2c933-air",
    Water: "https://chatgpt.com/g/g-6945d5a97570819191173ba622f7dad5-water",
    Fire: "https://chatgpt.com/g/g-6945daa59cd88191a673ba5bbf16ffdc-fire",
    Wood: "https://chatgpt.com/g/g-6945c5ca80608191a88b82c365342f9f-wood",
    Earth: "https://chatgpt.com/g/g-6945d7402b288191a2c57d49174c5a6a-earth",
    Metal: "https://chatgpt.com/g/g-6945d80679488191ae01c674a88d58ae-metal"
  };
  const DAEMON = { Air: "Aerunik", Water: "Sentaria", Fire: "Jvalion", Wood: "Arboriel", Earth: "Humavita", Metal: "Ferrosid" };

  // Submit a Mode D write-up to be published as an account (same Apps Script /exec as intake/relay).
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbxArMD_riaWpEeTZdjcX6VHVWpOZPtcQaAayk68K_B3DiQUJk7Z2iimv-EnlxAS7g0/exec";
  function postRetrieval(payload) {
    return fetch(ENDPOINT, { method: "POST", mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }).catch(function () {});
  }

  let TR = null, AREA = null, LIB = null;
  const load = () => Promise.all([
    fetch("transitions.json").then(r => r.json()),
    fetch("area-taxonomy.json").then(r => r.json()),
    fetch("transitions_prompts.json").then(r => r.json())
  ]).then(([t, a, l]) => { TR = t.transitions; AREA = a; LIB = l.library; });

  const q = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  function elc(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  const clear = m => { while (m.firstChild) m.removeChild(m.firstChild); };

  function step(mount, framing, options, onPick) {
    clear(mount);
    if (framing) mount.appendChild(elc("p", "cyoa-framing", esc(framing)));
    const list = elc("div", "cyoa-options");
    options.forEach(opt => {
      const b = elc("button", "cyoa-door"); b.type = "button";
      b.innerHTML = '<span class="cyoa-door-label">' + esc(opt.label) + "</span>" +
        (opt.hint ? '<span class="cyoa-door-hint">' + esc(opt.hint) + "</span>" : "");
      b.addEventListener("click", () => onPick(opt));
      list.appendChild(b);
    });
    mount.appendChild(list);
  }

  const hingeOf = (f, t) => { const x = TR.find(y => y.from === f && y.to === t); return x ? x.hinge : ""; };

  // Citations are already requested in every prompt, but many search-LLMs surface them in a side panel
  // or tooltip that's lost the moment the participant copies the text out — useless for the blog. So we
  // also dictate the OUTPUT FORMAT: markdown, citations inline + copyable. One tunable suffix on every
  // prompt (no corpus edit), so it's easy to refine as you test which LLMs actually comply.
  const CITE_DIRECTIVE =
    "\n\nFormat your entire response as markdown. Under each passage, give its citation inline as plain, " +
    "copyable text — author, work, year, a locator (chapter/section/page), and a direct link or DOI if one " +
    "exists. Do not put citations in a sidebar, tooltip, footnote, or collapsed panel, and do not omit them: " +
    "they must survive being copied as part of the text. If you cannot give a real, locatable citation for a " +
    "passage, leave that passage out rather than include it uncited.";

  function page() {
    return load().then(() => {
      const head = q("#head"), pick = q("#pick"), confirm = q("#confirm"), area = q("#area"), result = q("#result");
      head.innerHTML =
        '<span class="element-mark" aria-hidden="true">⌖</span>' +
        '<p class="eyebrow">a reading, taken outward</p>' +
        '<h1>Find real accounts of a movement</h1>' +
        '<p class="orientation">Name a movement you’ve lived — a shift from one way of being to another — and we’ll hand you a search prompt for any search-enabled LLM, to find <em>real, attributable</em> passages where other people have documented that same turn. Then read them, and ask: does this seem real for me?</p>' +
        '<p class="orientation" style="font-size:0.94em;opacity:0.82;">We start by placing the movement at one of three scales, because the same turn reads differently at each: <strong>Personal</strong> — you, as an individual; <strong>Local</strong> — a group, team, or place; <strong>Global</strong> — a society or system. Then we narrow from there to where you’d find real accounts.</p>';

      let SCALE = null, PRESEED = null;
      const states = () => STATE_BY_SCALE[SCALE.id];

      // Scale first — it sets the register the movement is named in (an individual / a group / a system).
      function pickScale() {
        pick.hidden = false;
        step(pick, "First — at what scale does this movement live?",
          AREA.scales.map(s => ({ label: s.label, hint: s.gloss, ref: s })),
          o => { SCALE = o.ref; clear(pick);
                 if (PRESEED) return confirmStep(PRESEED.f, PRESEED.x);
                 pickFrom(); });
      }
      function pickFrom() {
        pick.hidden = false;
        step(pick, "Where did it start?",
          ORDER.map(e => ({ label: states()[e].label, hint: states()[e].gloss, ref: e })),
          o => pickTo(o.ref));
      }
      function pickTo(from) {
        step(pick, "And where did it move to?",
          ORDER.filter(e => e !== from).map(e => ({ label: states()[e].label, hint: states()[e].gloss, ref: e })),
          o => confirmStep(from, o.ref));
      }
      function confirmStep(from, to) {
        pick.hidden = true;
        confirm.innerHTML =
          '<p class="cyoa-framing">Does this sound like your movement?</p>' +
          '<p class="reading" style="margin:0 0 1.6em;">' + esc(hingeOf(from, to)) + "</p>" +
          '<div class="cyoa-options">' +
          '<button type="button" class="cyoa-door" id="r-yes"><span class="cyoa-door-label">Yes — that’s the turn</span></button>' +
          '<button type="button" class="cyoa-door" id="r-no"><span class="cyoa-door-label">Not quite — choose again</span></button></div>';
        confirm.hidden = false;
        q("#r-yes").addEventListener("click", () => { confirm.hidden = true; fieldStep(from, to); });
        q("#r-no").addEventListener("click", () => { confirm.hidden = true; clear(pick); PRESEED = null; pickFrom(); });
      }
      // Then drill down within the chosen scale: which part of that life, and where to look.
      function fieldStep(from, to) {
        area.hidden = false;
        step(area, "Closer in — which part of " + SCALE.label.toLowerCase() + " life?",
          SCALE.fields.map(f => ({ label: f.text, hint: f.gloss, ref: f })),
          fl => step(area, "And where would you look for real accounts of it?",
            AREA.sources.map(so => ({ label: so.label, hint: so.gloss + (so.fits.indexOf(SCALE.id) >= 0 ? " · a natural fit for the " + SCALE.label.toLowerCase() + " scale" : ""), ref: so })),
            src => resolve(from, to, SCALE, fl.ref, src.ref)));
      }
      function resolve(from, to, scale, field, source) {
        area.hidden = true;
        const key = from + "→" + to;
        const tmpl = (LIB[key] || {})[source.id] || "";
        const prompt = tmpl.replace("{{AREA}}", field.phrase) + CITE_DIRECTIVE;
        const aphi = "⌖(" + field.id + " | " + source.id + ") :" + scale.id;
        const TA = "width:100%;background:transparent;color:var(--ink);border:1px solid rgba(31,42,46,0.2);border-radius:6px;padding:0.7em 0.8em;font-family:inherit;font-size:0.95em;line-height:1.5;resize:vertical;";
        const IN = "width:100%;background:transparent;border:0;border-bottom:1px solid rgba(31,42,46,0.28);padding:0.4em 0.55em;font-family:inherit;font-size:1em;color:var(--ink);margin-top:1.1em;";
        result.innerHTML =
          '<p class="label">how this works</p>' +
          '<p style="margin:0 0 0.5em;">Below are two things to copy: a <strong>key</strong> for the guide, and a <strong>search prompt</strong>. Take the prompt to a search LLM to gather real, cited accounts; bring them back to the guide along with the key; read them together; then ask the guide for your reading. It hands you a <em>nemetic.φ</em> and a write-up — which you can submit at the end, to help build ' + DAEMON[to] + '’s knowledge and become a published account.</p>' +
          '<p class="label" style="margin-top:2.2em;">① copy this for the guide</p>' +
          '<p style="margin:0 0 0.7em;font-size:0.92em;opacity:0.82;">This line tells the guide what you went looking for — you’ll paste it together with what you find.</p>' +
          '<div class="copy-row"><code id="r-aphi">' + esc(aphi) + '</code></div>' +
          '<p style="margin:0.7em 0 0;"><button type="button" class="copy-btn" id="r-copy-phi">copy the key</button></p>' +
          '<p class="label" style="margin-top:2.4em;">② take this to a search LLM</p>' +
          '<div class="retrieve-prompt">' + esc(prompt) + "</div>" +
          '<p style="margin:1.4em 0 0;"><button type="button" class="copy-btn" id="r-copy">copy the prompt</button></p>' +
          '<p style="margin-top:1em;font-size:0.92em;opacity:0.85;">In testing, citations came back cleanest with <strong>Claude</strong> or <strong>ChatGPT</strong> — turn web search on for either — then Gemini, then Kimi, then Grok. The prompt is built to say <em>“nothing found”</em> rather than invent, so trust the empty result as much as the full one.</p>' +
          '<p class="label" style="margin-top:2.4em;">③ bring it back to the guide</p>' +
          '<p>Open <a class="door-link" href="' + GPT_URL[to] + '" target="_blank" rel="noopener">' + DAEMON[to] + '</a> (or any guide), paste the <strong>key</strong> and the passages you found, and read them together: <em>does this seem real for you — and where does yours diverge?</em> When you’re ready, ask for your reading — it hands back a <em>nemetic.φ</em> and a write-up.</p>' +
          '<p class="label" style="margin-top:2.4em;">④ submit your reading <span style="opacity:0.55;font-style:italic;">— optional</span></p>' +
          '<p>Paste the write-up ' + DAEMON[to] + ' gave you. It helps build the guide’s knowledge and becomes a published <em>account</em> in ' + DAEMON[to] + '’s voice, citations intact. Add a name to be credited (or leave blank to stay anonymous), and an email if you’d like the link when it’s live.</p>' +
          '<textarea id="r-md" rows="8" placeholder="paste the whole markdown write-up ' + DAEMON[to] + ' gave you" style="' + TA + '"></textarea>' +
          '<input id="r-name" type="text" placeholder="name to credit (optional)" style="' + IN + '">' +
          '<input id="r-email" type="email" placeholder="email for the link (optional)" style="' + IN + '">' +
          '<p style="margin:1.6em 0 0;"><button type="button" class="copy-btn" id="r-submit">submit my reading</button></p>' +
          '<p style="margin:0.8em 0 0;font-size:0.86em;opacity:0.6;">Each account is reviewed before it’s published.</p>';
        result.hidden = false;
        q("#r-copy").addEventListener("click", function () {
          navigator.clipboard && navigator.clipboard.writeText(prompt); this.textContent = "copied ✓";
        });
        q("#r-copy-phi").addEventListener("click", function () {
          navigator.clipboard && navigator.clipboard.writeText(aphi); this.textContent = "copied ✓";
        });
        q("#r-submit").addEventListener("click", function () {
          const md = (q("#r-md").value || "").trim();
          if (!md) { q("#r-md").focus(); return; }
          const name = (q("#r-name").value || "").trim();
          const email = (q("#r-email").value || "").trim();
          postRetrieval({ action: "retrieval", element: to, movement: from + "→" + to, area: aphi,
                          markdown: md, name: name, email: email });
          let thanks = (name ? "Thank you, " + esc(name) + " — " : "Thank you — ") +
            "your reading is in. " + DAEMON[to] + " will write it up as an account" +
            (email ? ", and we’ll email <strong>" + esc(email) + "</strong> the link when it’s live."
                   : "; watch the #" + to.toLowerCase() + " channel in the Discord for the link.");
          result.innerHTML = '<p class="label">submitted</p><p>' + thanks +
            '</p><p style="font-size:0.86em;opacity:0.6;margin-top:0.8em;">Each account is reviewed before it’s published.</p>';
          result.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        result.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      // a relay handoff can pre-seed the movement (?t=Fire-Wood); we still ask scale first, then confirm.
      const t = new URLSearchParams(location.search).get("t");
      if (t && t.indexOf("-") > 0) {
        const [f, x] = t.split("-");
        if (ORDER.indexOf(f) >= 0 && ORDER.indexOf(x) >= 0 && f !== x) PRESEED = { f: f, x: x };
      }
      pickScale();
    });
  }

  return { page };
})();
