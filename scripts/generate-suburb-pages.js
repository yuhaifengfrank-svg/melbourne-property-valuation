/**
 * generate-suburb-pages.js — SEO static page generator (v2)
 *
 * Generates /suburb/{suburb}-vic.html for all suburbs with updated scoring.
 *
 * Run: node scripts/generate-suburb-pages.js [--limit=248]
 * Output: public/suburb/
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
const OUT = 'public';

function slug(suburb) {
  return suburb.toLowerCase().replace(/[\s.]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
}

async function getAllSuburbs(limit) {
  const rows = await sql`
    SELECT suburb, state,
      median_house_price, median_unit_price, median_apartment_price, median_townhouse_price, median_combined_price,
      median_rent, median_unit_rent,
      growth_score, gross_yield, vacancy_rate, vacancy_rate_adjusted, school_score,
      undervaluation, undervaluation_label,
      opportunity_score, opportunity_type,
      overall_confidence,
      population_2021, population_2025, population_growth_1y,
      conf_supply_constraint, conf_income,
      dwelling_total, dwelling_separate_house
    FROM suburb_metrics
    WHERE opportunity_score IS NOT NULL
    ORDER BY opportunity_score DESC
    LIMIT ${limit}
  `;
  function n(v) { return v != null ? Number(v) : null; }
  return rows.map(r => ({
    suburb: r.suburb, state: r.state || 'VIC',
    medianHousePrice: n(r.median_house_price),
    medianUnitPrice: n(r.median_unit_price),
    medianApartmentPrice: n(r.median_apartment_price),
    medianTownhousePrice: n(r.median_townhouse_price),
    medianCombinedPrice: n(r.median_combined_price),
    medianRent: n(r.median_rent),
    medianUnitRent: n(r.median_unit_rent),
    growthScore: n(r.growth_score),
    grossYield: n(r.gross_yield),
    vacancyRate: n(r.vacancy_rate_adjusted),
    schoolScore: n(r.school_score),
    undervaluation: n(r.undervaluation),
    undervaluationLabel: r.undervaluation_label,
    opportunityScore: n(r.opportunity_score),
    opportunityType: r.opportunity_type,
    overallConfidence: n(r.overall_confidence),
    population2021: n(r.population_2021),
    population2025: n(r.population_2025),
    populationGrowth: n(r.population_growth_1y),
    supplyConstraintScore: n(r.conf_supply_constraint),
    confIncome: n(r.conf_income),
    dwellingTotal: n(r.dwelling_total),
    dwellingSeparateHouse: n(r.dwelling_separate_house),
  }));
}

function suburbPageHTML(data) {
  const s = slug(data.suburb);
  const priceStr = data.medianHousePrice
    ? `$${(data.medianHousePrice / 1000).toFixed(0)}K`
    : 'N/A';
  const unitStr = data.medianUnitPrice
    ? `$${(data.medianUnitPrice / 1000).toFixed(0)}K`
    : 'N/A';
  const aptStr = data.medianApartmentPrice
    ? `$${(data.medianApartmentPrice / 1000).toFixed(0)}K`
    : 'N/A';
  const townStr = data.medianTownhousePrice
    ? `$${(data.medianTownhousePrice / 1000).toFixed(0)}K`
    : 'N/A';
  const combinedStr = data.medianCombinedPrice
    ? `$${(data.medianCombinedPrice / 1000).toFixed(0)}K`
    : 'N/A';
  const rentStr = data.medianRent
    ? `$${data.medianRent}`
    : 'N/A';
  const unitRentStr = data.medianUnitRent
    ? `$${data.medianUnitRent}`
    : 'N/A';
  const growthStr = data.growthScore != null
    ? `${data.growthScore >= 0 ? '+' : ''}${data.growthScore}`
    : 'N/A';
  const yieldStr = data.grossYield != null
    ? `${data.grossYield.toFixed(1)}%`
    : 'N/A';
  const vacStr = data.vacancyRate != null
    ? `${data.vacancyRate.toFixed(1)}%`
    : 'N/A';
  const schools = data.schoolScore != null
    ? `${Math.round(data.schoolScore)}/100`
    : 'N/A';
  const uvStr = data.undervaluation != null
    ? Number(data.undervaluation).toFixed(2)
    : 'N/A';
  const pop2021Str = data.population2021 != null
    ? data.population2021.toLocaleString()
    : 'N/A';
  const popGrowthStr = data.populationGrowth != null
    ? data.populationGrowth.toFixed(1) + '%'
    : 'N/A';
  const confStr = data.overallConfidence != null
    ? data.overallConfidence + '/100'
    : 'N/A';

  function titleCase(s) {
    return String(s).replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  }
  const topOpt = data.opportunityType || 'Balanced Opportunity';
  const score = data.opportunityScore || 0;

  const drivers = [
    score >= 60 ? 'Metric-supported opportunity ranking' : 'Developing market indicators',
    data.schoolScore >= 60 ? 'Quality school zone present' : 'Standard school zone performance',
    data.growthScore >= 50 ? 'Positive growth signal' : 'Moderate growth signal',
    data.medianHousePrice ? 'Median price available for comparison' : 'Price data developing',
  ];

  const risks = [
    score < 50 ? 'Below-average opportunity score' : 'Competitive market conditions',
    data.growthScore != null && data.growthScore < 30 ? 'Below-average growth score' : 'Stable growth indicator',
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${data.suburb} ${data.state} Property Market & Opportunity Analysis | AusHomeValue</title>
  <meta name="description" content="Detailed property market analysis for ${data.suburb}, ${data.state}. Opportunity Score: ${score}/100. Median house price ${priceStr}. Growth Score: ${growthStr}. Schools: ${schools}." />
  <link rel="canonical" href="https://www.aushomevalue.com.au/suburb/${s}-vic.html" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${data.suburb} Property Market Analysis | AusHomeValue" />
  <meta property="og:description" content="Opportunity Score ${score}/100 — ${topOpt}. Median house price ${priceStr}. Growth score ${growthStr}." />
  <meta property="og:url" content="https://www.aushomevalue.com.au/suburb/${s}-vic.html" />
  <link rel="stylesheet" href="/shared-responsive.css" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, system-ui, -apple-system, sans-serif; background: #f4f6f5; color: #17211d; line-height: 1.6; }
    .topbar { background: #0d6b57; color: white; padding: 14px 24px; }
    .topbar a { color: white; text-decoration: none; font-weight: 600; }
    .container { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    h1 { font-size: clamp(1.3rem, 4vw, 1.8rem); margin-bottom: 8px; }
    .score-hero { display: flex; gap: 20px; flex-wrap: wrap; align-items: center; margin-bottom: 32px; }
    .score-badge { background: #0d6b57; color: white; border-radius: 30px; padding: 10px 24px; font-size: 2rem; font-weight: 700; }
    .score-sub { color: #66736d; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 32px; }
    .card { background: white; border: 1px solid #dbe2de; border-radius: 10px; padding: 18px; }
    .card h3 { font-size: 0.85rem; color: #66736d; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .card .value { font-size: 1.3rem; font-weight: 700; }
    .disclaimer { font-size: 0.82rem; color: #5c7068; margin: 24px 0; line-height: 1.5; }
    .faq { margin-top: 40px; }
    .faq h2 { margin-bottom: 16px; }
    .faq-q { font-weight: 600; margin-top: 18px; }
    .faq-a { color: #66736d; margin-top: 4px; }
    @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } .grid-3 { grid-template-columns: 1fr; } }
  </style>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Place",
    "name": "${data.suburb}, ${data.state}",
    "description": "Property market analysis for ${data.suburb}, ${data.state}. Opportunity score ${score}/100.",
    "containedInPlace": { "@type": "State", "name": "${data.state}, Australia" },
    "additionalProperty": [
      { "@type": "PropertyValue", "name": "Opportunity Score", "value": "${score}/100" },
      { "@type": "PropertyValue", "name": "Median House Price", "value": "${priceStr}" },
      { "@type": "PropertyValue", "name": "Median Unit Price", "value": "${unitStr}" },
      { "@type": "PropertyValue", "name": "Growth Score", "value": "${growthStr}/100" },
      { "@type": "PropertyValue", "name": "School Score", "value": "${schools}" },
      { "@type": "PropertyValue", "name": "Opportunity Type", "value": "${topOpt}" },
      { "@type": "PropertyValue", "name": "Gross Rental Yield", "value": "${yieldStr}" },
      { "@type": "PropertyValue", "name": "Vacancy Rate (adjusted)", "value": "${vacStr}" }
    ]
  }
  </script>
</head>
<body>
  <div class="topbar"><a href="/">← AusHomeValue</a></div>
  <div class="container">
    <h1>${titleCase(data.suburb)}, ${data.state} — Property Market Analysis</h1>
    <div class="score-hero">
      <div class="score-badge">${score}</div>
      <div><strong>${topOpt}</strong><br /><span class="score-sub">Opportunity Score · ${score}/100</span></div>
    </div>

    <div class="grid-2">
      <div class="card"><h3>Median House Price</h3><div class="value">${priceStr}</div></div>
      <div class="card"><h3>School Score</h3><div class="value">${schools}</div></div>
    </div>

    <div class="grid-3">
      <div class="card"><h3>Growth Score</h3><div class="value">${growthStr}</div></div>
      <div class="card"><h3>Gross Yield</h3><div class="value">${yieldStr}</div></div>
      <div class="card"><h3>Vacancy</h3><div class="value">${vacStr}</div></div>
    </div>

    <div class="grid-3">
      <div class="card"><h3>Median Unit</h3><div class="value">${unitStr}</div></div>
      <div class="card"><h3>Median Rent</h3><div class="value">${rentStr}/wk</div></div>
      <div class="card"><h3>Data Confidence</h3><div class="value">${confStr}</div></div>
    </div>

    <p class="disclaimer">Future Opportunity Index is a relative screening score, not a forecast, valuation or promise of future capital growth. Data updated nightly from public sources.</p>

    <h2>Growth Drivers</h2>
    <ul>${drivers.map(d => '<li>' + d + '</li>').join('')}</ul>

    <h2 style="margin-top: 24px;">Risk Factors</h2>
    <ul>${risks.map(r => '<li>' + r + '</li>').join('')}</ul>

    <div class="faq">
      <h2>FAQ — ${data.suburb} Property Market</h2>
      <div class="faq-q">What is the property opportunity score for ${data.suburb}?</div>
      <div class="faq-a">${data.suburb} scores ${score}/100, classified as ${topOpt.toLowerCase()}.</div>
      <div class="faq-q">What is the median house price in ${data.suburb}?</div>
      <div class="faq-a">The median house price is approximately ${priceStr}, based on recent comparable sales data.</div>
      <div class="faq-q">Is ${data.suburb} a good area for property investment?</div>
      <div class="faq-a">With an opportunity score of ${score}/100 and a growth score of ${growthStr}/100, ${data.suburb} presents a ${score >= 60 ? 'stronger' : 'developing'} composite indicator. This is a relative screening score, not a price forecast.</div>
      <div class="faq-q">What are the schools like in ${data.suburb}?</div>
      <div class="faq-a">The school quality score for ${data.suburb} is ${schools}, based on ICSEA data from ACARA school profiles in the area.</div>
    </div>
  </div>
</body>
</html>`;
}

async function generateAll() {
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '248', 10);
  const top = await getAllSuburbs(limit);

  const suburbDir = path.join(OUT, 'suburb');
  fs.mkdirSync(suburbDir, { recursive: true });

  let n = 0;
  for (const s of top) {
    const html = suburbPageHTML(s);
    const filename = slug(s.suburb) + '-vic.html';
    fs.writeFileSync(path.join(suburbDir, filename), html);
    n++;
    if (n % 50 === 0) process.stdout.write(`  ${n}/${top.length}...\n`);
  }
  console.log(`  Generated ${n} suburb pages`);

  // Verify a few
  const narre = top.find(s => s.suburb.toLowerCase().includes('narre warren south'));
  if (narre) {
    console.log(`\n  Sample: ${narre.suburb} → score ${narre.opportunityScore}, type ${narre.opportunityType}`);
  }
}

generateAll()
  .then(() => process.exit(0))
  .catch(e => { console.error('Generate failed:', e); process.exit(1); });
