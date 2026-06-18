// Learning doors — copy a φ key (σ(facet | ?)) to the clipboard, then nudge the participant
// to paste it into the element's GPT. Shared by the six guide pages. No dependencies.
(function () {
  function flash(btn) {
    var label = btn.textContent;
    btn.classList.add("copied");
    btn.textContent = "copied — paste it to the guide";
    setTimeout(function () { btn.classList.remove("copied"); btn.textContent = label; }, 1600);
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".phi-key");
    if (!btn) return;
    var phi = btn.getAttribute("data-phi") || btn.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(phi).then(function () { flash(btn); }, function () { flash(btn); });
    } else {
      var ta = document.createElement("textarea");
      ta.value = phi; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (err) {}
      document.body.removeChild(ta); flash(btn);
    }
  });
})();
