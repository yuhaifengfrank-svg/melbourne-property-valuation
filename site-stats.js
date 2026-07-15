(function loadSiteStats() {
  const displayRules = {
    comparableSales: 10000,
    schoolsMapped: 100,
    suburbsCovered: 100
  };

  function publicCount(value, step) {
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0) return "—";
    const roundedDown = Math.floor(count / step) * step;
    return `${roundedDown.toLocaleString("en-AU")}+`;
  }

  fetch("/site-stats.json", { cache: "no-cache" })
    .then(response => {
      if (!response.ok) throw new Error(`site stats unavailable (${response.status})`);
      return response.json();
    })
    .then(stats => {
      for (const [key, step] of Object.entries(displayRules)) {
        document.querySelectorAll(`[data-site-stat="${key}"]`).forEach(element => {
          element.textContent = publicCount(stats[key], step);
        });
      }
    })
    .catch(() => {
      // Keep the neutral placeholder. Never display a stale hard-coded claim.
    });
})();
