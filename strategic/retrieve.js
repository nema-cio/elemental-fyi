/* Retrieval page — pick a movement → drill the area → get the ready-to-run search prompt.
 *
 * Fully static: looks the prompt up from the pre-built corpus (transitions_prompts.json) and
 * substitutes {{AREA}} with the drilldown's field phrase. No backend. The transition can arrive
 * from a relay handoff (?t=Fire-Wood) or be picked here in plain, non-elemental language.
 */
window.RETRIEVE = (function () {
  const ORDER = ["Air", "Water", "Fire", "Wood", "Earth", "Metal"];
  // the six element-states in plain language — the surface never names the elements
  const STATE = {
    Air:   { label: "Clear-eyed",   gloss: "seeing, naming, making distinctions" },
    Water: { label: "Connected",    gloss: "feeling, attuned, close to something" },
    Fire:  { label: "Driven",       gloss: "aimed, committed, moving toward something" },
    Wood:  { label: "Open",         gloss: "exploring, playing with what could be" },
    Earth: { label: "Grounded",     gloss: "sustaining, maintaining, keeping going" },
    Metal: { label: "Holding form", gloss: "keeping a boundary, a rule, a structure" }
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

  function page() {
    return load().then(() => {
      const head = q("#head"), pick = q("#pick"), confirm = q("#confirm"), area = q("#area"), result = q("#result");
      head.innerHTML =
        '<span class="element-mark" aria-hidden="true">⌖</span>' +
        '<p class="eyebrow">a reading, taken outward</p>' +
        '<h1>Find real accounts of a movement</h1>' +
        '<p class="orientation">Name an inner movement you’ve been through — a shift from one way of being to another. We’ll hand you a search prompt to take to any search-enabled LLM, to find <em>real, attributable</em> passages where other people have documented that same turn. Then read them, and ask: does this seem real for me?</p>';

      function pickFrom() {
        pick.hidden = false;
        step(pick, "Where did it start?",
          ORDER.map(e => ({ label: STATE[e].label, hint: STATE[e].gloss, ref: e })),
          o => pickTo(o.ref));
      }
      function pickTo(from) {
        step(pick, "And where did it move to?",
          ORDER.filter(e => e !== from).map(e => ({ label: STATE[e].label, hint: STATE[e].gloss, ref: e })),
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
        q("#r-yes").addEventListener("click", () => { confirm.hidden = true; areaStep(from, to); });
        q("#r-no").addEventListener("click", () => { confirm.hidden = true; clear(pick); pickFrom(); });
      }
      function areaStep(from, to) {
        area.hidden = false;
        step(area, "Where does this movement live for you?",
          AREA.scales.map(s => ({ label: s.label, hint: s.gloss, ref: s })),
          sc => step(area, "Closer in — which part of " + sc.ref.label.toLowerCase() + " life?",
            sc.ref.fields.map(f => ({ label: f.text, hint: f.gloss, ref: f })),
            fl => step(area, "And where would you look for real accounts of it?",
              AREA.sources.map(so => ({ label: so.label, hint: so.gloss + (so.fits.indexOf(sc.ref.id) >= 0 ? " · a natural fit for the " + sc.ref.label.toLowerCase() + " scale" : ""), ref: so })),
              src => resolve(from, to, sc.ref, fl.ref, src.ref))));
      }
      function resolve(from, to, scale, field, source) {
        area.hidden = true;
        const key = from + "→" + to;
        const tmpl = (LIB[key] || {})[source.id] || "";
        const prompt = tmpl.replace("{{AREA}}", field.phrase);
        const aphi = "⌖(" + field.id + " | " + source.id + ") :" + scale.id;
        result.innerHTML =
          '<p class="label">your search prompt</p>' +
          '<p class="chain" style="margin:0 0 1.4em;">' + esc(aphi) + "</p>" +
          '<div class="retrieve-prompt">' + esc(prompt) + "</div>" +
          '<p style="margin:1.4em 0 0;"><button type="button" class="copy-btn" id="r-copy">copy the prompt</button></p>' +
          '<p class="label" style="margin-top:2.4em;">now</p>' +
          '<p>Paste it into a search-enabled LLM — Perplexity, ChatGPT (search on), Claude, or Gemini — and let it bring back real passages. It’s built to say <em>“nothing found”</em> rather than invent, so trust the empty result as much as the full one.</p>' +
          '<p style="margin-top:1.2em;">Then bring what you find back to <a class="door-link" href="' + GPT_URL[to] + '" target="_blank" rel="noopener">' + DAEMON[to] + "</a> — or any of the guides — and read it together: <em>does this seem real for you, and if not, why not?</em></p>";
        result.hidden = false;
        const btn = q("#r-copy");
        btn.addEventListener("click", function () {
          navigator.clipboard && navigator.clipboard.writeText(prompt);
          this.textContent = "copied ✓";
        });
        result.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      const t = new URLSearchParams(location.search).get("t");
      if (t && t.indexOf("-") > 0) {
        const [f, x] = t.split("-");
        if (STATE[f] && STATE[x] && f !== x) return confirmStep(f, x);
      }
      pickFrom();
    });
  }

  return { page };
})();
