/** Set OS chrome class as early as possible (external file — CSP blocks inline scripts). */
(function () {
  var p = (window.lumina && window.lumina.platform) || "unknown";
  document.documentElement.dataset.platform = p;
  document.documentElement.classList.add("platform-" + p);
})();
