function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function yearsBetween(start, end) {
  return (new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`))
    / (365.2425 * 24 * 60 * 60 * 1000);
}

export function calculateCagr({ startValue, endValue, startDate, endDate }) {
  const start = finite(startValue); const end = finite(endValue);
  const from = isoDate(startDate); const to = isoDate(endDate);
  if (start == null || end == null || !from || !to || from >= to) return null;
  const years = yearsBetween(from, to);
  if (years <= 0) return null;
  return Math.round(((end / start) ** (1 / years) - 1) * 10000) / 100;
}

export function deriveHistoricalGrowth(observations, {
  asOf = null, horizons = [1, 3, 5, 10], toleranceDays = 120,
} = {}) {
  const clean = observations.map((item) => ({ ...item, date: isoDate(item.asOf), value: finite(item.value) }))
    .filter((item) => item.date && item.value != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (clean.length === 0) return { asOf: null, metrics: {} };
  const endBoundary = isoDate(asOf) || clean.at(-1).date;
  const eligible = clean.filter((item) => item.date <= endBoundary);
  const end = eligible.at(-1);
  if (!end) return { asOf: null, metrics: {} };
  const metrics = {};
  for (const horizon of horizons) {
    const target = new Date(`${end.date}T00:00:00Z`);
    target.setUTCFullYear(target.getUTCFullYear() - horizon);
    const targetMs = target.getTime();
    const candidates = eligible.filter((item) => item.date < end.date)
      .map((item) => ({ item, distance: Math.abs(new Date(`${item.date}T00:00:00Z`).getTime() - targetMs) }))
      .sort((a, b) => a.distance - b.distance);
    const best = candidates[0];
    if (!best || best.distance > toleranceDays * 86400000) {
      metrics[`${horizon}y`] = null;
      continue;
    }
    metrics[`${horizon}y`] = {
      value: calculateCagr({ startValue: best.item.value, endValue: end.value,
        startDate: best.item.date, endDate: end.date }),
      startValue: best.item.value, endValue: end.value,
      periodStart: best.item.date, periodEnd: end.date,
      sourceKey: end.sourceKey || best.item.sourceKey || null,
      propertyType: end.propertyType || best.item.propertyType || null,
      geography: end.geography || best.item.geography || null,
    };
  }
  return { asOf: end.date, metrics };
}
