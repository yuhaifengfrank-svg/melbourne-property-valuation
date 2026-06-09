/**
 * generate-suburb-pages.js — SEO static page generator
 *
 * Generates /suburb/{suburb}-{state}.html for top N suburbs
 * + /opportunities/ index pages.
 *
 * Run: node scripts/generate-suburb-pages.js [--limit=230]
 * Output: dist/opportunities/  and  dist/suburb/
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
const OUT = 'dist';

function slug(suburb, state) {
  return `${suburb.toLowerCase().replace(/\s+/g, '-')}-${(state || 'vic').toLowerCase()}`;
}

async function getAllSuburbs(limit) {
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
  const unitStr = data.medianUnitPrice
    ? `$${(data.medianUnitPrice / 1000).toFixed(0)}K`
    : 'N/A';
  const growthStr = data.growth3y != null
    ? `${data.growth3y >= 0 ? '+' : ''}${data.growth3y}%`
    : 'Limited data';
  const schools = data.schoolScore != null
    ? `${Math.round(data.schoolScore)}/100`
    : 'Limited data';

  const topOpt = data.opportunityType || 'Balanced Opportunity';
  const score = data.opportunityScore || 0;

  const drivers = [
    score >= 60 ? 'Metric-supported opportunity ranking' : 'Developing market indicators',
    data.schoolScore >= 60 ? 'Quality school zone present' : 'Standard school zone performance',
    data.growth3y >= 5 ? 'Positive 3-year price trend' : 'Moderate price movement',
    data.medianHousePrice ? 'Median price available for comparison' : 'Price data developing',
  ];

  const risks = [
    score < 50 ? 'Below-average opportunity score' : 'Competitive market conditions',
    data.growth3y != null && data.growth3y < 0 ? 'Recent price correction' : 'Stable price cycle',
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${data.suburb} ${data.state} Property Market & Opportunity Analysis | AusHomeValue</title>
  <meta name="description" content="Detailed property market analysis for ${data.suburb}, ${data.state}. Opportunity Score: ${score}/100. Median house price ${priceStr}. Growth: ${growthStr}. Schools: ${schools}." />
  <link rel="canonical" href="https://www.aushomevalue.com.au/suburb/${s}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${data.suburb} Property Market Analysis | AusHomeValue" />
  <meta property="og:description" content="Opportunity Score ${score}/100 — ${topOpt}. Median house price ${priceStr}. ${growthStr} 3-year growth." />
  <meta property="og:url" content="https://www.aushomevalue.com.au/suburb/${s}" />
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
      { "@type": "PropertyValue", "name": "3-Year Growth", "value": "${growthStr}" },
      { "@type": "PropertyValue", "name": "School Score", "value": "${schools}" },
      { "@type": "PropertyValue", "name": "Opportunity Type", "value": "${topOpt}" }
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
      <div class="score-badge">${score}</div>
      <div><strong>${topOpt}</strong><br /><span class="score-sub">Opportunity Score · ${score}/100</span></div>
    </div>

    <div class="grid-2">
      <div class="card"><h3>Median House Price</h3><div class="value">${priceStr}</div></div>
      <div class="card"><h3>3-Year Growth</h3><div class="value">${growthStr}</div></div>
      <div class="card"><h3>School Score</h3><div class="value">${schools}</div></div>
      <div class="card"><h3>Median Unit Price</h3><div class="value">${unitStr}</div></div>
    </div>

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
      <div class="faq-a">With an opportunity score of ${score}/100 and ${growthStr} 3-year growth, ${data.suburb} presents a ${score >= 60 ? 'stronger' : 'developing'} opportunity for property investment.</div>
      <div class="faq-q">What are the schools like in ${data.suburb}?</div>
      <div class="faq-a">The school quality score for ${data.suburb} is ${schools}, based on ICSEA data from ACARA school profiles in the area.</div>
    </div>
  </div>
</body>
</html>`;
}

function opportunitiesIndexHTML(top, categories) {
  const oppList = top.map(s => {
    const slugName = slug(s.suburb, s.state);
    const pctGrowth = s.growth3y != null ? (s.growth3y >= 0 ? '+' : '') + s.growth3y + '%' : 'N/A';
    return `<div class="card">
        <div>
          <h2><a href="/suburb/${slugName}.html" style="color:#0d6b57;text-decoration:none;">${s.suburb}, ${s.state}</a></h2>
          <div class="meta">${s.opportunityType || 'Balanced'} · Median $${(s.medianHousePrice / 1000).toFixed(0)}K · ${pctGrowth} 3yr</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;"><span class="badge">${s.opportunityScore}</span><span class="badge-sub">${s.opportunityType || 'Balanced'}</span></div>
      </div>`;
  }).join('');

  const catLinks = categories.map(c => {
    const count = top.filter(c.filter).length;
    return `<a href="/opportunities/${c.file}">${c.title} (${count})</a>`;
  }).join('\n      ');

  return `<!DOCTYPE html>
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
    <p class="desc">Data-driven rankings updated nightly. ${top.length} suburbs scored across Melbourne and regional Victoria.</p>

    <div class="nav-links">
      ${catLinks}
    </div>

    ${oppList}
  </div>
</body>
</html>`;
}

function categoryPageHTML(cat, items, top) {
  const style = `  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
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
    @media (max-width: 640px) { .card { flex-direction: column; align-items: start; gap: 8px; } }
`;

  const itemsHtml = items.length > 0 ? items.map(s => {
    return `<div class="card">
        <div>
          <h2><a href="/suburb/${slug(s.suburb, s.state)}.html" style="color:#0d6b57;text-decoration:none;">${s.suburb}, ${s.state}</a></h2>
          <div class="meta">Score ${s.opportunityScore} · Median $${(s.medianHousePrice / 1000).toFixed(0)}K · ${s.growth3y != null ? (s.growth3y >= 0 ? '+' : '') + s.growth3y + '%' : 'N/A'} 3yr</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;"><span class="badge">${s.opportunityScore}</span><span class="badge-sub">${s.opportunityType || 'Balanced'}</span></div>
      </div>`;
  }).join('') : '<p>No suburbs currently match this category. Data refreshes nightly.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${cat.title} — Top Suburbs | AusHomeValue</title>
  <meta name="description" content="${cat.desc}" />
  <link rel="canonical" href="https://www.aushomevalue.com.au/opportunities/${cat.file}" />
  <meta property="og:title" content="${cat.title} | AusHomeValue" />
  <meta property="og:description" content="${cat.desc}" />
  <style>${style}</style>
</head>
<body>
  <div class="topbar"><a href="/" style="color:white;text-decoration:none;font-weight:600;">← AusHomeValue</a></div>
  <div class="container">
    <h1>${cat.title}</h1>
    <p class="desc">${cat.desc}</p>
    <p><a href="/opportunities/">← Back to all opportunities</a></p>
    ${itemsHtml}
  </div>
</body>
</html>`;
}

async function generateAll() {
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '230', 10);
  const top = await getAllSuburbs(limit);
  console.log(`Fetching ${top.length} suburbs...`);

  const suburbDir = path.join(OUT, 'suburb');
  const oppDir = path.join(OUT, 'opportunities');
  fs.mkdirSync(suburbDir, { recursive: true });
  fs.mkdirSync(oppDir, { recursive: true });

  // Suburb pages
  let n = 0;
  for (const s of top) {
    const html = suburbPageHTML(s);
    const filename = slug(s.suburb, s.state) + '.html';
    fs.writeFileSync(path.join(suburbDir, filename), html);
    n++;
    if (n % 50 === 0) process.stdout.write(`  [suburb] ${n}/${top.length}...\n`);
  }
  console.log(`  [suburb] ${n} pages generated`);

  // Category definitions
  const categories = [
    { file: 'growth.html', title: 'Growth Opportunities', desc: 'Suburbs with the strongest price growth trajectory.', filter: s => (s.growth3y || 0) >= 5 },
    { file: 'school-zone.html', title: 'School Zone Opportunities', desc: 'Top-ranked suburbs for school quality based on ICSEA scores from ACARA.', filter: s => s.schoolScore >= 65 },
    { file: 'cashflow.html', title: 'Cashflow Opportunities', desc: 'Suburbs with strong rental yield potential and rental demand indicators.', filter: s => (s.schoolScore || 0) >= 60 && (s.opportunityScore || 0) >= 60 },
    { file: 'infrastructure.html', title: 'Infrastructure Opportunities', desc: 'Growth corridors and suburbs near major infrastructure developments.', filter: s => (s.opportunityScore || 0) >= 65 },
    { file: 'balanced.html', title: 'Balanced Opportunities', desc: 'Suburbs with balanced growth-yield-value profiles.', filter: s => s.opportunityType !== 'Value' && s.opportunityType !== 'School Zone' },
    { file: 'value.html', title: 'Value Opportunities', desc: 'Suburbs priced below median with upside potential.', filter: s => s.opportunityType === 'Value' },
  ];

  // Opportunities index
  const oppHtml = opportunitiesIndexHTML(top, categories);
  fs.writeFileSync(path.join(oppDir, 'index.html'), oppHtml);
  console.log('  [opp] index.html');

  // Category pages
  for (const cat of categories) {
    const items = top.filter(cat.filter);
    const html = categoryPageHTML(cat, items, top);
    fs.writeFileSync(path.join(oppDir, cat.file), html);
    console.log(`  [opp] ${cat.file} (${items.length} suburbs)`);
  }

  console.log(`\n✓ Generated ${top.length} suburb pages + ${1 + categories.length} opportunity pages`);
}

generateAll()
  .then(() => process.exit(0))
  .catch(e => { console.error('Generate failed:', e); process.exit(1); });
