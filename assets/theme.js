/* Theme switch — light | dark, per visitor, remembered.
 *
 * THEME IS NOT REGISTER. Each page declares its register once (data-register on <html>:
 * soft = the Reader's descent, hard = the Architect's instrument) and that never changes.
 * The theme only decides which ground each register sits on; hard mode stays deeper than
 * soft in both, so the lab still reads as below the descent. See elemental-tokens.css.
 *
 * Loaded synchronously in <head> so data-theme is on <html> before first paint — a deferred
 * script would flash the light ground at a visitor who chose dark.
 */
(function () {
  var KEY = "elemental-theme";           // "light" | "dark" — absent means follow the system
  var root = document.documentElement;
  var mql = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

  function stored() {
    try { var v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; }
    catch (e) { return null; }           // private mode / storage disabled — fall through
  }
  function systemTheme() { return mql && mql.matches ? "dark" : "light"; }
  function resolved() { return stored() || systemTheme(); }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    // The glyph shows the ground you'd move TO, which is also what the label promises.
    var next = theme === "dark" ? "light" : "dark";
    var btns = document.querySelectorAll(".theme-toggle");
    for (var i = 0; i < btns.length; i++) {
      btns[i].textContent = theme === "dark" ? "☀" : "☾";
      btns[i].setAttribute("aria-label", "Switch to " + next + " mode");
      btns[i].setAttribute("title", "Switch to " + next + " mode");
      btns[i].setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    }
    // Canvas and other painted marks can't read CSS as it changes — let them know.
    try { window.dispatchEvent(new CustomEvent("elemental:theme", { detail: { theme: theme } })); }
    catch (e) {}
  }

  apply(resolved());                     // before paint

  // Follow the system until the visitor makes a choice of their own.
  if (mql && mql.addEventListener) {
    mql.addEventListener("change", function () { if (!stored()) apply(systemTheme()); });
  }

  function wire() {
    var btns = document.querySelectorAll(".theme-toggle");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        try { localStorage.setItem(KEY, next); } catch (e) {}
        apply(next);
      });
    }
    apply(resolved());                   // re-label now the buttons exist
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
