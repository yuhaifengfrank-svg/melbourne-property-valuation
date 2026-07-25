const finite = (value) => {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function normalizeSuburb(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function selectExactSuburb(opportunities, suburb) {
  const target = normalizeSuburb(suburb);
  return (Array.isArray(opportunities) ? opportunities : [])
    .find((item) => normalizeSuburb(item?.suburb) === target) || null;
}

export function formatMoney(value) {
  const number = finite(value);
  return number == null ? null : new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(number);
}

function setText(root, key, value) {
  const element = root.querySelector(`[data-market-field="${key}"]`);
  if (element) element.textContent = value;
}

function setMeta(root, key, value) {
  const element = root.querySelector(`[data-market-meta="${key}"]`);
  if (element) element.textContent = value;
}

export function renderMarketSnapshot(root, item) {
  const updated = item?.dataUpdated ? `Updated ${item.dataUpdated}` : "Current database snapshot";
  setText(root, "house-price", formatMoney(item?.medianHousePrice) || "Not currently available");
  setText(root, "unit-price", formatMoney(item?.medianUnitPrice) || "Not currently available");
  setMeta(root, "house-price", updated);
  setMeta(root, "unit-price", updated);

  const score = item?.score;
  setText(root, "opportunity-score", score?.display || "Data unavailable");
  setMeta(root, "opportunity-score", score
    ? `${score.band} · ${score.horizon} · ${score.modelVersion} · not a price forecast`
    : "Current unified score is unavailable");

  const school = finite(item?.schoolScore);
  const supply = finite(item?.supplyConstraintScore);
  setText(root, "school-score", school == null ? "Data unavailable" : `${Math.round(school)}/100`);
  setText(root, "supply-score", supply == null ? "Data unavailable" : `${Math.round(supply)}/100`);

  const threeBedroomRent = finite(item?.threeBedroomHouseRent);
  const fourBedroomRent = finite(item?.fourBedroomHouseRent);
  const yieldValue = finite(item?.rentalYield ?? item?.grossYield);
  const vacancy = finite(item?.vacancyRate);
  const rentalParts = [];
  if (threeBedroomRent != null) rentalParts.push(`3BR ${formatMoney(threeBedroomRent)}/wk`);
  if (fourBedroomRent != null) rentalParts.push(`4BR ${formatMoney(fourBedroomRent)}/wk`);
  if (yieldValue != null) rentalParts.push(`Yield ${yieldValue.toFixed(2)}%`);
  if (vacancy != null) rentalParts.push(`Vacancy ${vacancy.toFixed(2)}%`);
  setText(root, "rent", rentalParts.length ? rentalParts.join(" · ") : "3/4房租金数据补充中");
  setMeta(root, "rent", rentalParts.length
    ? `${updated}. Metric definitions remain source-labelled.`
    : "The current API has no publishable suburb-level 3/4-bedroom house rent, yield or vacancy value; legacy figures are not reused.");

  const status = root.querySelector("[data-market-status]");
  if (status) status.textContent = `AusHomeValue current database snapshot · ${updated} · 房价为区域中位数，评分为相对研究信号。`;
  root.setAttribute("aria-busy", "false");
}

export async function loadMarketSnapshot(root, fetchImpl = fetch) {
  const suburb = root?.dataset?.suburb;
  if (!suburb) return;
  try {
    const query = new URLSearchParams({ suburb, strategy: "balanced", maxResults: "5" });
    const response = await fetchImpl(`/api/opportunity?${query}`);
    if (!response.ok) throw new Error("Market API unavailable");
    const payload = await response.json();
    const exact = selectExactSuburb(payload?.opportunities, suburb);
    if (!exact) throw new Error("No exact suburb match");
    renderMarketSnapshot(root, exact);
  } catch {
    for (const key of ["house-price", "unit-price", "opportunity-score", "school-score", "supply-score"]) {
      setText(root, key, "Temporarily unavailable");
    }
    setText(root, "rent", "租金数据补充中");
    const status = root.querySelector("[data-market-status]");
    if (status) status.textContent = "实时市场数据暂时无法读取；下方已核验规划内容仍可正常查看。";
    root.setAttribute("aria-busy", "false");
  }
}

if (typeof document !== "undefined") {
  for (const root of document.querySelectorAll("[data-suburb-market]")) loadMarketSnapshot(root);
}
