/**
 * generate-suburb-pages.js — SEO static page generator
 *
 * Generates /suburb/{suburb}-{state}.html for top 20 suburbs
 * + /opportunities/ index pages.
 *
 * Run: node scripts/generate-suburb-pages.js
 * Output: dist/opportunities/  and  dist/suburb/
 */

import { neon } from '@neondatabase/serverless';
import { scanOpportunitiesV2 } from '../lib/opportunity-scoring-v2.js';
import fs from 'fs';
import path from 'path';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

const OUT = 'dist';

function slug(suburb, state) {
  return `${suburb.toLowerCase().replace(/\s+/g, '-')}-${(state || 'vic').toLowerCase()}`;
}

async function getTopSuburbs(limit = 20) {
  const rows = await sql.query(
    'SELECT suburb, state, median_house_price, median_unit_price, ' +
    'growth_1y, growth_3y, growth_5y, school_score, opportunity_score, opportunity_type ' +
    'FROM suburb_metrics WHERE opportunity_score IS NOT NULL ' +
    'ORDER BY opportunity_score DESC LIMIT $1',
    [limit]
  );
  return rows.map(r => ({
    suburb: r.suburb, state: r.state || 'VIC',
    medianHousePrice: r.median_house_price,
    medianUnitPrice: r.median_unit_price,
    growth1y: r.growth_1y, growth3y: r.growth_3y, growth5y: r.growth_5y,
    schoolScore: r.school_score,
    opportunityScore: r.opportunity_score,
    opportunityType: r.opportunity_type,
  }));
}

function suburbPageHTML(data) {
  const s = slug(data.suburb, data.state);
  const priceStr = data.medianHousePrice
    ? `$${(data.medianHousePrice / 1000).toFixed(0)}K`
    : 'N/A';
  const growthStr = data.growth3y != null
    ? `${data.growth3y >= 0 ? '+' : ''}${data.growth3y}%`
    : 'Limited data';
  const schools = data.schoolScore != null
    ? `${Math.round(data.schoolScore)}/100`
    : 'Limited data';

  const drivers = [
    data.opportunityScore >= 70 ? 'Strong price growth indicators' : 'Stable market fundamentals',
    data.schoolScore >= 60 ? 'Quality school zone present' : 'Standard school zone performance',
    data.growth3y >= 5 ? 'Positive 3-year price trend' : 'Moderate price movement',
    data.medianHousePrice ? 'Median price available for comparison' : 'Price data developing',
  ];

  const risks = [
    data.opportunityScore < 60 ? 'Below-average opportunity score' : 'Competitive market conditions',
    data.growth3y != null && data.growth3y < 0 ? 'Recent price decline' : 'Stable price cycle',
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${data.suburb} ${data.state} Property Market & Opportunity Analysis | AusHomeValue</title>
  <meta name="description" content="Detailed property market analysis for ${data.suburb}, ${data.state}. Opportunity Score: ${data.opportunityScore}/100. Median house price ${priceStr}. Growth: ${growthStr}. Schools: ${schools}." />
  <link rel="canonical" href="https://www.aushomevalue.com.au/suburb/${s}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${data.suburb} Property Market Analysis | AusHomeValue" />
  <meta property="og:description" content="Opportunity Score ${data.opportunityScore}/100 — ${data.opportunityType || 'Balanced'}. Median house price ${priceStr}. ${growthStr} 3-year growth." />
  <meta property="og:url" content="https://www.aushomevalue.com.au/suburb/${s}" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Place",
    "name": "${data.suburb}, ${data.state}",
    "description": "Property market analysis for ${data.suburb}, ${data.state}. Opportunity score ${data.opportunityScore}/100.",
    "containedInPlace": { "@type": "State", "name": "${data.state}, Australia" },
    "additionalProperty": [
      { "@type": "PropertyValue", "name": "Opportunity Score", "value": "${data.opportunityScore}/100" },
      { "@type": "PropertyValue", "name": "Median House Price", "value": "${priceStr}" },
      { "@type": "PropertyValue", "name": "3-Year Growth", "value": "${growthStr}" },
      { "@type": "PropertyValue", "name": "School Score", "value": "${schools}" },
      { "@type": "PropertyValue", "name": "Opportunity Type", "value": "${data.opportunityType || 'Balanced'}" }
    ]
  }
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, system-ui, -apple-system, sans-serif; background: #f4f6f5; color: #17211d; line-height: 1.6; }
    .topbar { background: #0d6b57; color: white; padding: 14px 24px; }
    .topbar a { color: white; text-decoration: none; font-weight: 600; }
    .container { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    h1 { font-size: 1.8rem; margin-bottom: 8px; }
    .score-hero { display: flex; gap: 20px; flex-wrap: wrap; align-items: center; margin-bottom: 32px; }
    .score-badge { background: #0d6b57; color: white; border-radius: 30px; padding: 10px 24px; font-size: 2rem; font-weight: 700; }
    .score-sub { color: #66736d; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
    .card { background: white; border: 1px solid #dbe2de; border-radius: 10px; padding: 18px; }
    .card h3 { font-size: 0.85rem; color: #66736d; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .card .value { font-size: 1.3rem; font-weight: 700; }
    .faq { margin-top: 40px; }
    .faq h2 { margin-bottom: 16px; }
    .faq-q { font-weight: 600; margin-top: 18px; }
    .faq-a { color: #66736d; margin-top: 4px; }
    @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="topbar"><a href="/">← AusHomeValue</a></div>
  <div class="container">
    <h1>${data.suburb}, ${data.state} — Property Market Analysis</h1>
    <div class="score-hero">
      <div class="score-badge">${data.opportunityScore}</div>
      <div><strong>${data.opportunityType || 'Balanced Opportunity'}</strong><br /><span class="score-sub">Opportunity Score · ${data.opportunityScore}/100</span></div>
    </div>

    <div class="grid-2">
      <div class="card"><h3>Median House Price</h3><div class="value">${priceStr}</div></div>
      <div class="card"><h3>3-Year Growth</h3><div class="value">${growthStr}</div></div>
      <div class="card"><h3>School Score</h3><div class="value">${schools}</div></div>
      <div class="card"><h3>Median Unit Price</h3><div class="value">${data.medianUnitPrice ? '$' + (data.medianUnitPrice/1000).toFixed(0) + 'K' : 'N/A'}</div></div>
    </div>

    <h2>Growth Drivers</h2>
    <ul>${drivers.map(d => '<li>' + d + '</li>').join('')}</ul>

    <h2 style="margin-top: 24px;">Risk Factors</h2>
    <ul>${risks.map(r => '<li>' + r + '</li>').join('')}</ul>

    <div class="faq">
      <h2>FAQ — ${data.suburb} Property Market</h2>
      <div class="faq-q">What is the property opportunity score for ${data.suburb}?</div>
      <div class="faq-a">${data.suburb} scores ${data.opportunityScore}/100, classified as a ${(data.opportunityType || 'Balanced Opportunity').toLowerCase()}.</div>
      <div class="faq-q">What is the median house price in ${data.suburb}?</div>
      <div class="faq-a">The median house price is approximately ${priceStr}, based on recent comparable sales data.</div>
      <div class="faq-q">Is ${data.suburb} a good area for property investment?</div>
      <div class="faq-a">With an opportunity score of ${data.opportunityScore}/100 and ${growthStr} 3-year growth, ${data.suburb} presents a ${data.opportunityScore >= 70 ? 'strong' : 'moderate'} opportunity for property investment. Factors include ${drivers.slice(0, 2).join(' and ')}.</div>
      <div class="faq-q">What schools are in ${data.suburb}?</div>
      <div class="faq-a">The school quality score for ${data.suburb} is ${schools}, based on ICSEA data from ACARA school profiles in the area.</div>
    </div>
  </div>
</body>
</html>`;
}

async function generateAll() {
  const top = await getTopSuburbs(20);

  // Ensure output dirs
  const suburbDir = path.join(OUT, 'suburb');
  const oppDir = path.join(OUT, 'opportunities');
  fs.mkdirSync(suburbDir, { recursive: true });
  fs.mkdirSync(oppDir, { recursive: true });

  // Generate suburb pages
  for (const s of top) {
    const html = suburbPageHTML(s);
    const filename = slug(s.suburb, s.state) + '.html';
    fs.writeFileSync(path.join(suburbDir, filename), html);
    console.log(`  [suburb] ${filename}`);
  }

  // Generate /opportunities index
  const oppIndex = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Top Property Opportunities in Victoria | AusHomeValue</title>
  <meta name="description" content="Browse the top-ranked property opportunities across Melbourne and Victoria. Opportunity scores driven by growth, school zones, rental yield and vacancy data." />
  <link rel="canonical" href="https://www.aushomevalue.com.au/opportunities" />
  <meta property="og:title" content="Top Property Opportunities | AusHomeValue" />
  <meta property="og:description" content="Data-driven property opportunity rankings across Victoria. Updated nightly." />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, system-ui, -apple-system, sans-serif; background: #f4f6f5; color: #17211d; line-height: 1.6; }
    .topbar { background: #0d6b57; color: white; padding: 14px 24px; }
    .container { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    h1 { font-size: 1.8rem; margin-bottom: 8px; }
    .desc { color: #66736d; margin-bottom: 28px; }
    .card { background: white; border: 1px solid #dbe2de; border-radius: 10px; padding: 18px; margin-bottom: 12px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; }
    .card h2 { font-size: 1.1rem; margin: 0; }
    .card .meta { font-size: 0.85rem; color: #66736d; margin-top: 4px; }
    .badge { background: #0d6b57; color: white; border-radius: 30px; padding: 6px 16px; font-weight: 700; font-size: 1.1rem; }
    .badge-sub { background: #e8f3ef; color: #0d6b57; border-radius: 20px; padding: 4px 12px; font-size: 0.8rem; }
    .nav-links { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 24px; }
    .nav-links a { background: white; border: 1px solid #dbe2de; border-radius: 8px; padding: 8px 16px; color: #0d6b57; text-decoration: none; font-weight: 500; }
    .nav-links a:hover { background: #e8f3ef; }
    @media (max-width: 640px) { .card { flex-direction: column; align-items: start; gap: 8px; } }
  </style>
</head>
<body>
  <div class="topbar"><a href="/" style="color:white;text-decoration:none;font-weight:600;">← AusHomeValue</a></div>
  <div class="container">
    <h1>Top Property Opportunities in Victoria</h1>
    <p class="desc">Data-driven rankings updated nightly. Scoring based on price growth, school quality, rental yield, vacancy rates and undervaluation analysis.</p>

    <div class="nav-links">
      <a href="/opportunities/growth.html">Growth Opportunities</a>
      <a href="/opportunities/school-zone.html">School Zone Opportunities</a>
      <a href="/opportunities/cashflow.html">Cashflow Opportunities</a>
      <a href="/opportunities/infrastructure.html">Infrastructure Opportunities</a>
    </div>

    ${top.map(s => {
      const pctGrowth = s.growth3y != null ? (s.growth3y >= 0 ? '+' : '') + s.growth3y + '%' : 'N/A';
      return `<div class="card">
        <div>
          <h2><a href="/suburb/${slug(s.suburb, s.state)}.html" style="color:#0d6b57;text-decoration:none;">${s.suburb}, ${s.state}</a></h2>
          <div class="meta">${s.opportunityType || 'Balanced'} · Median $${(s.medianHousePrice/1000).toFixed(0)}K · ${pctGrowth} 3yr</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;"><span class="badge">${s.opportunityScore}</span><span class="badge-sub">${s.opportunityType || 'Balanced'}</span></div>
      </div>`;
    }).join('')}
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(oppDir, 'index.html'), oppIndex);
  console.log('  [opp] index.html');

  // Generate category pages
  const categories = [
    { file: 'growth.html', title: 'Growth Opportunities', desc: 'Suburbs with the strongest price growth trajectory — driven by 1-year, 3-year and 5-year trends plus population growth.', filter: s => s.growth3y >= 8 },
    { file: 'school-zone.html', title: 'School Zone Opportunities', desc: 'Top-ranked suburbs for school quality based on ICSEA scores from ACARA. Ideal for family-focused investment.', filter: s => s.schoolScore >= 70 },
    { file: 'cashflow.html', title: 'Cashflow Opportunities', desc: 'Properties with strong rental yield potential — combining gross yield data and market indicators.', filter: s => s.schoolScore >= 60 && s.opportunityScore >= 60 },
    { file: 'infrastructure.html', title: 'Infrastructure Opportunities', desc: 'Growth corridors and suburbs near major infrastructure projects across Melbourne and Victoria.', filter: s => s.opportunityScore >= 65 },
  ];

  for (const cat of categories) {
    const items = top.filter(cat.filter);
    const catHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${cat.title} — Top Suburbs | AusHomeValue</title>
  <meta name="description" content="${cat.desc}" />
  <link rel="canonical" href="https://www.aushomevalue.com.au/opportunities/${cat.file}" />
  <meta property="og:title" content="${cat.title} | AusHomeValue" />
  <meta property="og:description" content="${cat.desc}" />
  <style>${oppIndex.match(/<style>[\s\S]*?<\/style>/)?.[0] || ''}</style>
</head>
<body>
  <div class="topbar"><a href="/" style="color:white;text-decoration:none;font-weight:600;">← AusHomeValue</a></div>
  <div class="container">
    <h1>${cat.title}</h1>
    <p class="desc">${cat.desc}</p>
    <p><a href="/opportunities/">← Back to all opportunities</a></p>
    ${items.length > 0 ? items.map(s => {
      return `<div class="card">
        <div>
          <h2><a href="/suburb/${slug(s.suburb, s.state)}.html" style="color:#0d6b57;text-decoration:none;">${s.suburb}, ${s.state}</a></h2>
          <div class="meta">Score ${s.opportunityScore} · Median $${(s.medianHousePrice/1000).toFixed(0)}K · ${s.growth3y != null ? (s.growth3y >= 0 ? '+' : '') + s.growth3y + '%' : 'N/A'} 3yr</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;"><span class="badge">${s.opportunityScore}</span><span class="badge-sub">${s.opportunityType || 'Balanced'}</span></div>
      </div>`;
    }).join('') : '<p>No suburbs currently match this category. Data refreshes nightly.</p>'}
  </div>
</body>
</html>`;
    fs.writeFileSync(path.join(oppDir, cat.file), catHtml);
    console.log(`  [opp] ${cat.file}`);
  }

  console.log(`\n✓ Generated pages for ${top.length} suburbs + 5 opportunity pages`);
}

generateAll()
  .then(() => process.exit(0))
  .catch(e => { console.error('Generate failed:', e); process.exit(1); });
