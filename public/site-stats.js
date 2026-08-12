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

  function publicDate(value) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!value || Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
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
      const asOf = publicDate(stats.asOf);
      if (asOf) {
        document.querySelectorAll("[data-site-as-of]").forEach(element => {
          element.textContent = asOf;
        });
      }
    })
    .catch(() => {
      // Keep the neutral placeholder. Never display a stale hard-coded claim.
    });
})();
