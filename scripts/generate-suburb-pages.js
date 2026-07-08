/**
 * Generate canonical suburb market pages from Production suburb_metrics.
 *
 * Usage:
 *   node scripts/generate-suburb-pages.js [--limit=248] [--out=public]
 *
 * The generated page embeds its structured source row in #suburb-page-data so
 * tests can compare every visible metric with the database snapshot.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CANONICAL_ORIGIN = 'https://www.aushomevalue.com.au';
const DEFAULT_OUT = 'public';
const MAX_PUBLISHABLE_VACANCY = 15;

export function slug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function pageFilename(row) {
  return `${slug(row.suburb)}-${slug(row.state || 'VIC')}.html`;
}

export function displayName(value) {
  return String(value || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())
    .replace(/\bMccrae\b/g, 'McCrae');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function n(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value) {
  const number = n(value);
  return number == null ? 'Data not available' : new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', maximumFractionDigits: 0,
  }).format(number);
}

function number(value) {
  const parsed = n(value);
  return parsed == null ? 'Data not available' : new Intl.NumberFormat('en-AU').format(parsed);
}

function percent(value, digits = 1) {
  const parsed = n(value);
  return parsed == null ? 'Data not available' : `${parsed.toFixed(digits)}%`;
}

function score(value) {
  const parsed = n(value);
  return parsed == null ? 'Data not available' : `${Math.round(parsed)}/100`;
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function publishableVacancy(value) {
  const parsed = n(value);
  return parsed != null && parsed >= 0 && parsed <= MAX_PUBLISHABLE_VACANCY ? parsed : null;
}

export function normalizeRow(row) {
  const vacancyRaw = n(row.vacancy_rate_adjusted ?? row.vacancy_rate);
  return {
    suburb: String(row.suburb || '').trim(),
    state: String(row.state || 'VIC').trim().toUpperCase(),
    updatedAt: isoDate(row.updated_at),
    medianHousePrice: n(row.median_house_price),
    medianUnitPrice: n(row.median_unit_price),
    medianTownhousePrice: n(row.median_townhouse_price),
    medianHouseRent: n(row.median_rent ?? row.median_house_rent),
    medianUnitRent: n(row.median_unit_rent),
    grossYield: n(row.gross_yield),
    vacancyRate: publishableVacancy(vacancyRaw),
    vacancySuppressed: vacancyRaw != null && publishableVacancy(vacancyRaw) == null,
    growthScore: n(row.growth_score),
    schoolScore: n(row.school_score),
    opportunityScore: n(row.opportunity_score),
    opportunityType: row.opportunity_type || 'Balanced Opportunity',
    overallConfidence: n(row.overall_confidence),
    undervaluation: n(row.undervaluation),
    population2021: n(row.population_2021),
    population2025: n(row.population_2025),
    populationGrowth1y: n(row.population_growth_1y),
    governmentHouseMedian: n(row.govt_house_median),
    governmentHouseYear: n(row.govt_house_year),
    priceConfidence: n(row.source_confidence_price),
    rentConfidence: n(row.source_confidence_rent),
    vacancyConfidence: n(row.source_confidence_vacancy),
    scoringVersion: row.scoring_version || null,
  };
}

export async function fetchSuburbs(limit = 248) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  const rows = await sql.query(`
    SELECT suburb, state, updated_at,
      median_house_price, median_unit_price, median_townhouse_price,
      median_house_rent, median_rent, median_unit_rent,
      gross_yield, vacancy_rate, vacancy_rate_adjusted,
      growth_score, school_score, undervaluation,
      opportunity_score, opportunity_type, overall_confidence,
      population_2021, population_2025, population_growth_1y,
      govt_house_median, govt_house_year,
      source_confidence_price, source_confidence_rent,
      source_confidence_vacancy, scoring_version
    FROM suburb_metrics
    WHERE opportunity_score IS NOT NULL
    ORDER BY lower(suburb), state
    LIMIT $1
  `, [limit]);
  return rows.map(normalizeRow);
}

function metricCard(label, value, note = '') {
  return `<div class="metric-card"><h3>${escapeHtml(label)}</h3><div class="metric-value">${escapeHtml(value)}</div>${note ? `<p>${escapeHtml(note)}</p>` : ''}</div>`;
}

function faqSchema(data, name) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What is the median house price in ${name}?`,
        acceptedAnswer: { '@type': 'Answer', text: data.medianHousePrice == null
          ? `A median house price is not currently available for ${name}.`
          : `The current suburb-level median house price shown by AusHomeValue is ${money(data.medianHousePrice)}.` },
      },
      {
        '@type': 'Question',
        name: `What is the opportunity score for ${name}?`,
        acceptedAnswer: { '@type': 'Answer', text: data.opportunityScore == null
          ? `An opportunity score is not currently available for ${name}.`
          : `${name} has a relative opportunity screening score of ${score(data.opportunityScore)}. It is not a forecast or investment recommendation.` },
      },
      {
        '@type': 'Question',
        name: `How reliable is the data for ${name}?`,
        acceptedAnswer: { '@type': 'Answer', text: data.overallConfidence == null
          ? `A consolidated confidence score is not currently available for ${name}. Missing values are shown rather than estimated on this page.`
          : `The current overall data confidence score is ${score(data.overallConfidence)}. Review individual metric limitations before making a decision.` },
      },
    ],
  };
}

export function buildPage(data) {
  const name = displayName(data.suburb);
  const state = data.state;
  const file = pageFilename(data);
  const canonical = `${CANONICAL_ORIGIN}/suburb/${file}`;
  const updateLabel = data.updatedAt || 'date not available';
  const vacancyNote = data.vacancySuppressed
    ? 'Source value withheld because it falls outside the publishable 0-15% range.'
    : 'Adjusted vacancy indicator where available.';
  const populationCards = data.population2021 != null || data.population2025 != null
    ? `<section><h2>Population context</h2><div class="metric-grid">
        ${metricCard('Population 2021', number(data.population2021))}
        ${metricCard('Population 2025', number(data.population2025))}
        ${metricCard('Latest annual change', percent(data.populationGrowth1y))}
      </div></section>` : '';
  const governmentReference = data.governmentHouseMedian == null || data.governmentHouseYear == null ? ''
    : `<p><strong>Government reference:</strong> ${money(data.governmentHouseMedian)} (${escapeHtml(data.governmentHouseYear || 'year unavailable')}). This is shown separately from the current market median.</p>`;
  const pageData = JSON.stringify({ schemaVersion: 1, ...data }).replace(/</g, '\\u003c');
  const placeSchema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Place', name: `${name}, ${state}`,
    url: canonical, containedInPlace: { '@type': 'State', name: `${state}, Australia` },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Median House Price', value: data.medianHousePrice },
      { '@type': 'PropertyValue', name: 'Opportunity Score', value: data.opportunityScore },
      { '@type': 'PropertyValue', name: 'Overall Data Confidence', value: data.overallConfidence },
    ],
  }).replace(/</g, '\\u003c');
  const faq = JSON.stringify(faqSchema(data, name)).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(name)} ${state} Property Market Data | AusHomeValue</title>
  <meta name="description" content="Review ${escapeHtml(name)}, ${state} property market data, median prices, rental indicators, opportunity score and data confidence. Updated ${updateLabel}." />
  <link rel="canonical" href="${canonical}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${escapeHtml(name)} Property Market Data | AusHomeValue" />
  <meta property="og:description" content="Suburb-level prices, rental indicators, scores and data confidence for ${escapeHtml(name)}, ${state}." />
  <meta property="og:url" content="${canonical}" />
  <link rel="stylesheet" href="/shared-responsive.css" />
  <style>
    *,*::before,*::after{box-sizing:border-box} body{margin:0;background:#f4f6f5;color:#17211d;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55}
    a{color:#0d6b57}.topbar{background:#123f35;padding:14px 24px}.topbar a{color:#fff;text-decoration:none;font-weight:700}.container{max-width:1040px;margin:auto;padding:28px 20px 56px}
    .breadcrumb,.asof{color:#64736d;font-size:.86rem}.breadcrumb{margin-bottom:18px}h1{font-size:clamp(1.7rem,5vw,2.6rem);line-height:1.15;margin:0 0 8px;letter-spacing:0}
    .hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:30px}.score-box{min-width:150px;background:#0d6b57;color:#fff;padding:16px;border-radius:8px}.score-box strong{font-size:2rem;display:block}
    section{margin-top:34px}h2{font-size:1.25rem;margin-bottom:14px;letter-spacing:0}.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .metric-card{background:#fff;border:1px solid #d7e0dc;border-radius:8px;padding:16px;min-height:118px}.metric-card h3{font-size:.78rem;color:#64736d;text-transform:uppercase;margin:0 0 10px;letter-spacing:0}.metric-value{font-size:1.35rem;font-weight:750;overflow-wrap:anywhere}.metric-card p{font-size:.78rem;color:#64736d;margin:8px 0 0}
    .quality{background:#fff;border-left:4px solid #0d6b57;padding:18px 20px}.quality p{margin:6px 0}.disclaimer{margin-top:34px;color:#64736d;font-size:.84rem}.faq-item{border-top:1px solid #d7e0dc;padding:14px 0}.faq-item h3{font-size:1rem;margin:0 0 5px}.faq-item p{margin:0;color:#4e5d57}
    @media(max-width:700px){.hero{display:block}.score-box{margin-top:18px}.metric-grid{grid-template-columns:1fr}.metric-card{min-height:0}}
  </style>
  <script type="application/ld+json">${placeSchema}</script>
  <script type="application/ld+json">${faq}</script>
  <script id="suburb-page-data" type="application/json">${pageData}</script>
</head>
<body>
  <nav class="topbar"><a href="/">AusHomeValue</a></nav>
  <main class="container">
    <div class="breadcrumb"><a href="/">Home</a> / <a href="/opportunities/">Opportunities</a> / ${escapeHtml(name)}</div>
    <div class="hero"><div><h1>${escapeHtml(name)}, ${state}</h1><p class="asof">Suburb market data last updated: ${updateLabel}</p></div><div class="score-box"><span>Opportunity score</span><strong>${data.opportunityScore == null ? 'N/A' : Math.round(data.opportunityScore)}</strong><span>${escapeHtml(data.opportunityType)}</span></div></div>

    <section><h2>Market snapshot</h2><div class="metric-grid">
      ${metricCard('Median house price', money(data.medianHousePrice))}
      ${metricCard('Median unit price', money(data.medianUnitPrice))}
      ${metricCard('Median townhouse price', money(data.medianTownhousePrice))}
      ${metricCard('Median house rent', data.medianHouseRent == null ? 'Data not available' : `${money(data.medianHouseRent)} / week`)}
      ${metricCard('Gross rental yield', percent(data.grossYield))}
      ${metricCard('Vacancy indicator', percent(data.vacancyRate), vacancyNote)}
    </div></section>

    <section><h2>Decision-support scores</h2><div class="metric-grid">
      ${metricCard('Growth score', score(data.growthScore), 'Relative screening signal, not a measured growth rate.')}
      ${metricCard('School score', score(data.schoolScore), 'Based on available school profile data.')}
      ${metricCard('Overall data confidence', score(data.overallConfidence), 'Missing confidence is not replaced with zero.')}
    </div></section>

    ${populationCards}

    <section><h2>Data quality and sources</h2><div class="quality">
      <p><strong>Current market metrics:</strong> read from the production suburb_metrics dataset. Values may combine factual observations and derived indicators.</p>
      ${governmentReference}
      <p><strong>Price source confidence:</strong> ${score(data.priceConfidence)}. <strong>Rent:</strong> ${score(data.rentConfidence)}. <strong>Vacancy:</strong> ${score(data.vacancyConfidence)}.</p>
      <p>Unavailable or implausible values are withheld rather than estimated on this page.</p>
    </div></section>

    <section><h2>Frequently asked questions</h2>
      <div class="faq-item"><h3>What is the median house price in ${escapeHtml(name)}?</h3><p>${data.medianHousePrice == null ? 'Data not available.' : `The current suburb-level median shown is ${money(data.medianHousePrice)}.`}</p></div>
      <div class="faq-item"><h3>What is the opportunity score for ${escapeHtml(name)}?</h3><p>${data.opportunityScore == null ? 'Data not available.' : `${score(data.opportunityScore)}. This is a relative screening score, not a forecast.`}</p></div>
      <div class="faq-item"><h3>How should this page be used?</h3><p>Use it to screen and compare suburbs, then verify important figures with source records and licensed professionals before making a property decision.</p></div>
    </section>
    <p class="disclaimer">General information only. This page is not a valuation, investment recommendation, credit decision, legal, tax or financial advice.</p>
  </main>
</body>
</html>`.replace(/[ \t]+$/gm, '');
}

function buildLegacyRedirect(fromFile, toFile) {
  const target = `/suburb/${toFile}`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><link rel="canonical" href="${CANONICAL_ORIGIN}${target}"><meta http-equiv="refresh" content="0;url=${target}"><title>Page moved | AusHomeValue</title></head><body><p>This page moved to <a href="${target}">${target}</a>.</p></body></html>`;
}

export async function generate({ limit = 248, out = DEFAULT_OUT } = {}) {
  const rows = await fetchSuburbs(limit);
  const dir = path.join(out, 'suburb');
  fs.mkdirSync(dir, { recursive: true });

  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.html')) fs.unlinkSync(path.join(dir, file));
  }

  for (const row of rows) fs.writeFileSync(path.join(dir, pageFilename(row)), buildPage(row));

  // Preserve the one previously published, incorrectly state-suffixed URL.
  const sansSouci = rows.find(row => slug(row.suburb) === 'sans-souci' && row.state === 'NSW');
  if (sansSouci) {
    fs.writeFileSync(path.join(dir, 'sans-souci-vic.html'), buildLegacyRedirect('sans-souci-vic.html', pageFilename(sansSouci)));
  }

  const snapshotDir = path.join(out, 'data');
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(path.join(snapshotDir, 'suburb-page-source.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), rows }, null, 2)}\n`);
  console.log(`Generated ${rows.length} canonical suburb pages${sansSouci ? ' + 1 legacy redirect' : ''}.`);
  return rows;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const limit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || 248);
  const out = process.argv.find(arg => arg.startsWith('--out='))?.split('=')[1] || DEFAULT_OUT;
  generate({ limit, out }).catch(error => {
    console.error('Generate failed:', error.message);
    process.exitCode = 1;
  });
}
