#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALIDATION_DIR = path.join(ROOT, "data", "validation");
const OUTPUT_DIR = path.join(ROOT, "public", "suburb");

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const titleCase = (value) => String(value).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const slugify = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const money = (value) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
const number = (value) => new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(value);
const pct = (value, digits = 2) => `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(digits)}%`;

function metricCard(label, value, meta, note = "") {
  return `<article class="metric-card"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-meta">${escapeHtml(meta)}</div>${note ? `<p>${escapeHtml(note)}</p>` : ""}</article>`;
}

function section(title, intro, cards) {
  if (!cards.length) return "";
  return `<section><h2>${escapeHtml(title)}</h2>${intro ? `<p class="section-intro">${escapeHtml(intro)}</p>` : ""}<div class="metric-grid">${cards.join("")}</div></section>`;
}

export function buildValidatedSuburbPage(profile) {
  const { geography, facts = {}, modelInputs = {}, asOf } = profile;
  const suburb = titleCase(geography.suburb);
  const state = geography.state || "VIC";
  const slug = `${slugify(suburb)}-${state.toLowerCase()}`;
  const canonical = `https://www.aushomevalue.com.au/suburb/${slug}.html`;

  const market = [];
  if (facts.medianHousePrice?.publishable) market.push(metricCard("Median house price", money(facts.medianHousePrice.value), `${facts.medianHousePrice.period} · ${facts.medianHousePrice.geography}`, facts.medianHousePrice.source));
  if (facts.housePriceGrowth?.publishable) {
    const g = facts.housePriceGrowth.values;
    market.push(metricCard("1-year house price change", pct(g.oneYear.value), `${g.oneYear.startYear}–${facts.housePriceGrowth.endPeriod.slice(0, 4)} · official annual median series`, facts.housePriceGrowth.source));
    market.push(metricCard("3-year house price CAGR", pct(g.threeYearCagr.value), `${g.threeYearCagr.startYear}–${facts.housePriceGrowth.endPeriod.slice(0, 4)}`, facts.housePriceGrowth.source));
    market.push(metricCard("5-year house price CAGR", pct(g.fiveYearCagr.value), `${g.fiveYearCagr.startYear}–${facts.housePriceGrowth.endPeriod.slice(0, 4)}`, facts.housePriceGrowth.source));
    market.push(metricCard("10-year house price CAGR", pct(g.tenYearCagr.value), `${g.tenYearCagr.startYear}–${facts.housePriceGrowth.endPeriod.slice(0, 4)}`, facts.housePriceGrowth.source));
  }

  const rent = [];
  if (facts.threeBedroomHouseRent?.publishable) rent.push(metricCard("3-bedroom house rent", `${money(facts.threeBedroomHouseRent.value)}/week`, `${facts.threeBedroomHouseRent.period} · ${facts.threeBedroomHouseRent.geography}`, "Area-level DFFH rental median; not an exact-suburb observation"));
  if (facts.fourBedroomHouseRent?.publishable) rent.push(metricCard("4-bedroom house rent", `${money(facts.fourBedroomHouseRent.value)}/week`, `${facts.fourBedroomHouseRent.period} · ${facts.fourBedroomHouseRent.geography}`, "Area-level DFFH rental median; not an exact-suburb observation"));
  const vacancy = modelInputs.rentalVacancy;
  if (vacancy?.publishable && Number.isFinite(vacancy.value)) rent.push(metricCard("Estimated rental vacancy", `About ${Number(vacancy.value).toFixed(1)}%`, vacancy.period, `${vacancy.source}. Model estimate anchored to ${vacancy.benchmark}; not an observed suburb vacancy rate.`));

  const people = [];
  if (facts.population?.publishable) people.push(metricCard("Population", number(facts.population.value), `${facts.population.period} · ${facts.population.geography}`, facts.population.note));
  if (facts.totalDwellings?.publishable) people.push(metricCard("Dwellings", number(facts.totalDwellings.value), `${facts.totalDwellings.period} · ${facts.totalDwellings.geography}`));
  if (facts.rentedHouseholds?.publishable) people.push(metricCard("Rented households", number(facts.rentedHouseholds.value), `${facts.rentedHouseholds.period} · ${facts.rentedHouseholds.geography}`, facts.rentedHouseholds.note));
  if (facts.medianWeeklyHouseholdIncome?.publishable) people.push(metricCard("Median weekly household income", `${money(facts.medianWeeklyHouseholdIncome.value)}/week`, `${facts.medianWeeklyHouseholdIncome.period} · ${facts.medianWeeklyHouseholdIncome.geography}`, facts.medianWeeklyHouseholdIncome.note));

  const economy = [];
  if (facts.employment?.publishable) {
    economy.push(metricCard("Employed persons", number(facts.employment.employedPersons), `${facts.employment.period} · ${facts.employment.geography}`, facts.employment.note));
    economy.push(metricCard("Employment growth", pct(facts.employment.employmentGrowthYoY), `Year-on-year to ${facts.employment.period}`, facts.employment.source));
    economy.push(metricCard("Unemployment rate", `${Number(facts.employment.unemploymentRate).toFixed(2)}%`, `${facts.employment.period} · ${facts.employment.geography}`, facts.employment.source));
  }

  const supply = [];
  if (facts.buildingPermits2025?.publishable) {
    const b = facts.buildingPermits2025;
    supply.push(metricCard("Building permits", number(b.permitCount), "2025 · Oakleigh 3166, City of Monash", "Permits issued; not commencements or completions"));
    supply.push(metricCard("Domestic/residential permits", number(b.domesticResidentialPermitCount), "2025", "Official Victorian Building Authority permit extract"));
    supply.push(metricCard("Net additional dwellings", pct(b.netAdditionalDwellings, 0).replace("%", ""), "2025 permits: 43 new less 27 demolished", "Permit-based supply indicator"));
  }

  const planning = [];
  if (facts.planningPipeline2025?.publishable) {
    const p = facts.planningPipeline2025;
    planning.push(metricCard("Planning register records", number(p.exactRegisterRecords), `${p.period} · ${p.geography}`, "Official register records; amendments and repeat project records are included"));
    planning.push(metricCard("Unique planning projects", number(p.uniqueProjects), `${p.period} · deduplicated by base application number`, p.source));
    planning.push(metricCard("Projects with stated dwelling yield", number(p.quantifiedResidentialProjects), `${p.period}`, "Only projects whose official description states a dwelling quantity"));
    planning.push(metricCard("Proposed dwellings", number(p.netProposedDwellings), `${p.period} · description-derived`, "Proposed supply, not commencements or completions"));
    planning.push(metricCard("Status-weighted pipeline", Number(p.statusWeightedNetPipeline).toFixed(1), `Status checked ${p.statusReferenceDate}`, "AusHomeValue model indicator; not a physical dwelling count"));
  }

  const structured = [];
  const addStructured = (name, value, item, unitText) => {
    if (value == null) return;
    structured.push({ "@type": "PropertyValue", name, value, ...(unitText ? { unitText } : {}), description: `${item?.period || ""}${item?.source ? ` · ${item.source}` : ""}`.trim() });
  };
  if (facts.medianHousePrice?.publishable) addStructured("medianHousePrice", facts.medianHousePrice.value, facts.medianHousePrice, "AUD");
  if (facts.housePriceGrowth?.publishable) for (const [name, item] of Object.entries(facts.housePriceGrowth.values)) addStructured(name, item.value, { period: `${item.startYear}–${facts.housePriceGrowth.endPeriod.slice(0, 4)}`, source: facts.housePriceGrowth.source }, "%");
  if (facts.threeBedroomHouseRent?.publishable) addStructured("threeBedroomHouseRent", facts.threeBedroomHouseRent.value, facts.threeBedroomHouseRent, "AUD/week");
  if (facts.fourBedroomHouseRent?.publishable) addStructured("fourBedroomHouseRent", facts.fourBedroomHouseRent.value, facts.fourBedroomHouseRent, "AUD/week");
  if (facts.population?.publishable) addStructured("population", facts.population.value, facts.population, "people");
  if (facts.totalDwellings?.publishable) addStructured("totalDwellings", facts.totalDwellings.value, facts.totalDwellings, "dwellings");
  if (facts.rentedHouseholds?.publishable) addStructured("rentedHouseholds", facts.rentedHouseholds.value, facts.rentedHouseholds, "households");
  if (facts.medianWeeklyHouseholdIncome?.publishable) addStructured("medianWeeklyHouseholdIncome", facts.medianWeeklyHouseholdIncome.value, facts.medianWeeklyHouseholdIncome, "AUD/week");
  if (facts.employment?.publishable) {
    addStructured("employedPersons", facts.employment.employedPersons, facts.employment, "people");
    addStructured("employmentGrowthYoY", facts.employment.employmentGrowthYoY, facts.employment, "%");
    addStructured("unemploymentRate", facts.employment.unemploymentRate, facts.employment, "%");
  }
  if (facts.buildingPermits2025?.publishable) {
    addStructured("buildingPermitCount", facts.buildingPermits2025.permitCount, { period: "2025", source: "Victorian Building Authority" }, "permits");
    addStructured("netAdditionalDwellings", facts.buildingPermits2025.netAdditionalDwellings, { period: "2025", source: "Victorian Building Authority" }, "dwellings");
  }
  if (facts.planningPipeline2025?.publishable) {
    addStructured("planningRegisterRecords", facts.planningPipeline2025.exactRegisterRecords, facts.planningPipeline2025, "records");
    addStructured("uniquePlanningProjects", facts.planningPipeline2025.uniqueProjects, facts.planningPipeline2025, "projects");
    addStructured("proposedDwellings", facts.planningPipeline2025.netProposedDwellings, facts.planningPipeline2025, "dwellings");
  }
  if (vacancy?.publishable) structured.push({ "@type": "PropertyValue", name: "estimatedRentalVacancy", value: vacancy.value, unitText: "%", description: vacancy.note });

  const sections = [
    section("House market", "Official annual house-price observations; growth is historical CAGR, not a forecast.", market),
    section("Rental market", "House rents use the stated DFFH rental geography. Vacancy is separately identified as a model estimate.", rent),
    section("People and households", "Census facts remain labelled with their reference year and geography.", people),
    section("Local economy", "Official DEWR smoothed Small Area Labour Markets context.", economy),
    section("Housing supply", "Permit figures indicate approved activity, not completed homes.", supply),
    section("Planning pipeline", "Council planning applications are separated from building permits and completed housing supply.", planning),
  ].filter(Boolean).join("\n  ");

  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(suburb)} VIC Property Market Facts | AusHomeValue</title>
  <meta name="description" content="Verified property, rental, population and employment metrics for ${escapeHtml(suburb)}, ${state}, with dates, geography and source definitions.">
  <link rel="canonical" href="${canonical}"><meta name="robots" content="index, follow">
  <meta property="og:title" content="${escapeHtml(suburb)} Property Research | AusHomeValue"><meta property="og:description" content="Source-labelled property research for ${escapeHtml(suburb)}, current to the latest verified period."><meta property="og:url" content="${canonical}"><meta property="og:type" content="website">
  <link rel="stylesheet" href="/shared-responsive.css">
  <style>*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#17211d;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55}.topbar{background:#0d6b57;padding:14px 24px}.topbar a{color:#fff;text-decoration:none;font-weight:700}.container{max-width:1040px;margin:auto;padding:32px 20px 60px}.breadcrumb,.eyebrow,.section-intro,.metric-meta,.metric-card p{color:#66736d}.breadcrumb{font-size:.85rem;margin-bottom:20px}.breadcrumb a{color:#0d6b57}h1{font-size:clamp(1.8rem,5vw,2.7rem);line-height:1.15;margin:0 0 10px}.eyebrow{margin:0 0 32px}section{margin-top:38px}h2{font-size:1.35rem;margin-bottom:6px}.section-intro{margin:0 0 16px}.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.metric-card{background:#fff;border:1px solid #dbe2de;border-radius:12px;padding:18px}.metric-label{text-transform:uppercase;letter-spacing:.04em;color:#66736d;font-size:.76rem;font-weight:700}.metric-value{font-size:1.45rem;font-weight:800;margin:6px 0}.metric-meta{font-size:.82rem}.metric-card p{font-size:.78rem;margin:8px 0 0}.notice{background:#e8f3ef;border-left:4px solid #0d6b57;padding:14px 16px;margin-top:34px;border-radius:6px}.footer{border-top:1px solid #dbe2de;padding:24px;text-align:center;color:#66736d;font-size:.8rem}@media(max-width:560px){.container{padding:24px 14px 44px}.metric-grid{grid-template-columns:1fr}.metric-card{padding:16px}}</style>
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Place", name: `${suburb}, ${state}`, url: canonical, containedInPlace: { "@type": "AdministrativeArea", name: `${geography.lga}, ${state}` }, additionalProperty: structured })}</script>
</head><body><div class="topbar"><a href="/">← AusHomeValue</a></div><main class="container">
  <div class="breadcrumb"><a href="/">Home</a> / <a href="/suburb-research.html">Suburb Research</a> / ${escapeHtml(suburb)}</div>
  <h1>${escapeHtml(suburb)}, ${state} — Property Research</h1><p class="eyebrow">Postcode ${escapeHtml(geography.postcode)} · ${escapeHtml(geography.lga)} · Core market-data cutoff ${escapeHtml(asOf)}; later status checks are dated on the relevant metric.</p>
  ${sections}
  <div class="notice"><strong>How to read this page:</strong> facts, area-level context and model estimates are labelled separately. Metrics without a verified definition or source are omitted rather than replaced with legacy values.</div>
</main><footer class="footer">© ${new Date().getFullYear()} AusHomeValue · Research information only, not financial advice.</footer></body></html>\n`;
}

export function generateValidatedPages() {
  const files = fs.readdirSync(VALIDATION_DIR).filter((name) => name.endsWith("-validated-metrics.json"));
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputs = [];
  for (const file of files) {
    const profile = JSON.parse(fs.readFileSync(path.join(VALIDATION_DIR, file), "utf8"));
    const filename = `${slugify(profile.geography.suburb)}-${String(profile.geography.state || "VIC").toLowerCase()}.html`;
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), buildValidatedSuburbPage(profile));
    outputs.push(filename);
  }
  return outputs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Generated ${generateValidatedPages().length} validated suburb pages.`);
}
