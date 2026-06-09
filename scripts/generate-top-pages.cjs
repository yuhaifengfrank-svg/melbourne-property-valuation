#!/usr/bin/env node
/**
 * generate-top-pages.js — Phase 3A
 * Fetches from production API, generates static HTML for 4 top-N pages.
 *
 * Usage:
 *   node scripts/generate-top-pages.js
 *
 * Output:
 *   public/top-growth-suburbs-victoria.html
 *   public/top-value-suburbs-victoria.html
 *   public/top-yield-suburbs-victoria.html
 *   public/top-school-zone-suburbs-victoria.html
 */

const BASE = 'https://aushomevalue.vercel.app';
const fs = require('fs');
const path = require('path');

const PAGES = [
  {
    slug: 'top-growth-suburbs-victoria',
    title: 'Top Growth Suburbs Victoria 2026',
    h1: 'Top Growth Suburbs in Victoria',
    desc: 'Suburbs with the strongest forecast price appreciation. These areas show sustained 1–5 year capital growth momentum driven by infrastructure investment, demographic shifts, and supply constraints.',
    factor: 'growth',
    seo: 'Discover Victoria\'s top growth suburbs for 2026. Ranked by weighted 1-year, 3-year, and 5-year price growth with confidence-adjusted opportunity scores from AusHomeValue\'s intelligence engine.',
    navLabel: 'Growth',
    icon: '📈',
  },
  {
    slug: 'top-value-suburbs-victoria',
    title: 'Top Value Suburbs Victoria 2026 — Most Affordable Opportunities',
    h1: 'Top Value Suburbs in Victoria',
    desc: 'The most affordable entry points in the Victorian property market. These suburbs offer below-median pricing with strong upside potential — ideal for first-home buyers and value-conscious investors.',
    factor: 'value',
    seo: 'Find Victoria\'s best value suburbs for 2026. Affordable median prices, growth corridors, and infrastructure tailwinds. Ranked by price-to-value ratio with AusHomeValue confidence scores.',
    navLabel: 'Value',
    icon: '💎',
  },
  {
    slug: 'top-yield-suburbs-victoria',
    title: 'Top Rental Yield Suburbs Victoria 2026',
    h1: 'Top Rental Yield Suburbs in Victoria',
    desc: 'Suburbs delivering the strongest gross rental yields across Victoria. These areas offer compelling cash flow for investors, combining strong tenant demand with affordable purchase prices.',
    factor: 'yield',
    seo: 'Best rental yield suburbs in Victoria for 2026. Gross yield rankings with vacancy context and growth projections. Cash-flow positive investment opportunities ranked by AusHomeValue.',
    navLabel: 'Yield',
    icon: '💰',
  },
  {
    slug: 'top-school-zone-suburbs-victoria',
    title: 'Top School Zone Suburbs Victoria 2026 — Best Education Catchments',
    h1: 'Top School Zone Suburbs in Victoria',
    desc: 'Suburbs with the highest-rated school catchments. These areas command family-buyer premiums and offer superior price insulation during market downturns — ideal for long-term capital preservation.',
    factor: 'school',
    seo: 'Best school zone suburbs in Victoria for 2026. Toorak, Fairfield, Burwood, Canterbury — ranked by school quality scores. Family-friendly investment with price insulation.',
    navLabel: 'Schools',
    icon: '🏫',
  },
];

async function main() {
  for (const page of PAGES) {
    console.log(`\n─── ${page.title} ───`);

    const url = `${BASE}/api/top-${page.factor}?limit=50`;
    const res = await fetch(url);
    if (!res.ok) { console.error(`  FAIL ${url}: ${res.status}`); continue; }
    const json = await res.json();
    const results = json.results;
    console.log(`  Fetched ${results.length} results`);

    const html = buildPage(page, results);
    const outPath = path.join(__dirname, '..', 'public', `${page.slug}.html`);
    fs.writeFileSync(outPath, html, 'utf-8');
    console.log(`  Wrote ${outPath} (${html.length} bytes)`);
  }
  console.log('\n✅ Done');
}

function buildPage(page, results) {
  const rows = results.map((r, i) => {
    const rank = i + 1;
    const slug = r.suburb.toLowerCase().replace(/[\s.]+/g, '-').replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
    const suburbUrl = `/suburb/${slug}-vic.html`;

    // Build explanation summary
    let explainHtml = '';
    if (r.explanations && r.explanations.length > 0) {
      const bullets = r.explanations.slice(0, 2).map(e => `<li>${escapeHtml(e)}</li>`).join('');
      explainHtml = `<ul class="explain-list">${bullets}</ul>`;
    }

    return `
    <div class="rank-card" data-rank="${rank}">
      <div class="rank-number">${rank}</div>
      <div class="rank-body">
        <h3><a href="${suburbUrl}">${escapeHtml(r.suburb)}</a></h3>
        <div class="rank-meta">
          <span class="tag tag-${factorTag(page.factor)}">${page.icon} ${page.navLabel}</span>
          <span class="tag tag-opp">Opp ${r.opportunityScore ?? '—'}</span>
        </div>
        <div class="rank-stats">
          <div class="stat">
            <span class="stat-label">${page.navLabel}</span>
            <span class="stat-value">${r.factorScore ?? '—'}%</span>
            <span class="stat-tier">${r.factorTier ?? ''}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Confidence</span>
            <span class="stat-value">${r.overallConfidence ?? '—'}%</span>
          </div>
          <div class="stat">
            <span class="stat-label">Type</span>
            <span class="stat-type">${r.opportunityType ?? 'Balanced'}</span>
          </div>
        </div>
        ${explainHtml}
      </div>
    </div>`;
  }).join('\n');

  // Navigation tabs
  const navTabs = PAGES.map(p => `
    <a href="/${p.slug}.html" class="tab ${p.factor === page.factor ? 'tab-active' : ''}">
      ${p.icon} ${p.navLabel}
    </a>`).join('\n          ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(page.title)} | AusHomeValue</title>
  <meta name="description" content="${escapeHtml(page.seo)}" />
  <link rel="canonical" href="https://www.aushomevalue.com.au/${page.slug}.html" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.seo)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://www.aushomevalue.com.au/${page.slug}.html" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, system-ui, -apple-system, sans-serif;
      background: #f4f6f5; color: #17211d; line-height: 1.6;
    }
    a { color: #0d6b57; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .topbar {
      background: linear-gradient(135deg, #0d6b57 0%, #0a8f6e 100%);
      color: white; padding: 14px 24px; position: sticky; top: 0; z-index: 100;
    }
    .topbar a { color: white; font-weight: 600; font-size: 1.1rem; }
    .topbar .back { opacity: 0.85; }
    .topbar .back:hover { opacity: 1; text-decoration: none; }
    .container { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    h1 { font-size: clamp(1.5rem, 4vw, 2.2rem); font-weight: 800; line-height: 1.2; margin-bottom: 12px; }
    .page-desc { color: #4a5650; font-size: 1rem; max-width: 720px; margin-bottom: 32px; line-height: 1.7; }
    .tabs {
      display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 28px;
    }
    .tab {
      padding: 8px 18px; border-radius: 30px; font-size: 0.9rem; font-weight: 600;
      background: #e8f3ef; color: #0d6b57; transition: all 0.15s; white-space: nowrap;
    }
    .tab:hover { background: #d0e8e0; text-decoration: none; }
    .tab-active { background: #0d6b57; color: white; }
    .rank-card {
      display: flex; gap: 16px;
      background: white; border: 1px solid #dbe2de; border-radius: 12px;
      padding: 20px; margin-bottom: 12px; transition: box-shadow 0.15s;
    }
    .rank-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .rank-number {
      flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%;
      background: #0d6b57; color: white; font-size: 1rem; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .rank-number[data-rank="1"] { background: #ffd700; color: #17211d; }
    .rank-number[data-rank="2"] { background: #c0c0c0; color: #17211d; }
    .rank-number[data-rank="3"] { background: #cd7f32; color: white; }
    .rank-body { flex: 1; min-width: 0; }
    .rank-body h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 6px; }
    .rank-body h3 a { color: #17211d; }
    .rank-body h3 a:hover { color: #0d6b57; }
    .rank-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .tag {
      display: inline-block; padding: 3px 10px; border-radius: 20px;
      font-size: 0.78rem; font-weight: 600;
    }
    .tag-growth { background: #e3f5e3; color: #1a7a1a; }
    .tag-value { background: #e3eef5; color: #1a5a7a; }
    .tag-yield { background: #f5ede3; color: #7a5a1a; }
    .tag-school { background: #ede3f5; color: #5a1a7a; }
    .tag-opp { background: #f0f0f0; color: #555; }
    .rank-stats { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
    .stat { display: flex; flex-direction: column; }
    .stat-label { font-size: 0.75rem; color: #8a9b93; text-transform: uppercase; letter-spacing: 0.04em; }
    .stat-value { font-size: 1.05rem; font-weight: 700; }
    .stat-tier { font-size: 0.8rem; color: #66736d; }
    .stat-type { font-size: 0.85rem; color: #0d6b57; font-weight: 500; }
    .explain-list { margin: 6px 0 0 0; padding: 0; list-style: none; }
    .explain-list li {
      font-size: 0.85rem; color: #4a5650; line-height: 1.5;
      padding-left: 16px; position: relative; margin-bottom: 2px;
    }
    .explain-list li::before { content: '→'; position: absolute; left: 0; color: #0d6b57; }
    .footer {
      text-align: center; padding: 40px 20px; color: #8a9b93; font-size: 0.85rem;
      border-top: 1px solid #dbe2de; margin-top: 48px;
    }
    .foot-links { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-bottom: 8px; }
    .foot-links a { color: #4a5650; font-size: 0.85rem; }
    .breadcrumb { font-size: 0.85rem; color: #66736d; margin-bottom: 20px; }
    .breadcrumb a { color: #0d6b57; }
    @media (max-width: 640px) {
      .container { padding: 20px 14px; }
      .rank-card { flex-direction: column; padding: 14px; }
      .rank-number { width: 32px; height: 32px; font-size: 0.9rem; }
      .rank-stats { gap: 12px; }
    }
  </style>
  <script src="/opportunity-gate.js" defer></script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "${escapeHtml(page.title)}",
    "description": "${escapeHtml(page.seo)}",
    "url": "https://www.aushomevalue.com.au/${page.slug}.html",
    "about": {
      "@type": "Thing",
      "name": "Victorian Property Market"
    }
  }
  </script>
</head>
<body>
  <div class="topbar">
    <a href="/" class="back">← AusHomeValue</a>
  </div>
  <div class="container">
    <div class="breadcrumb">
      <a href="/">Home</a> / ${page.icon} ${page.h1}
    </div>
    <h1>${escapeHtml(page.h1)}</h1>
    <p class="page-desc">${escapeHtml(page.desc)}</p>
    <div class="tabs">
      ${navTabs}
    </div>
    <p style="margin-bottom: 20px; color: #66736d; font-size: 0.9rem;">
      Showing top ${results.length} suburbs ranked by ${page.navLabel.toLowerCase()} score.
      Scores combine market data, confidence calibrations, and factor-specific analysis.
      <a href="/methodology.html">Learn about our methodology →</a>
    </p>
    <div class="rank-list">
      ${rows}
    </div>
  </div>
  <div class="footer">
    <div class="foot-links">
      <a href="/">Home</a>
      <a href="/opportunities/">Opportunities</a>
      <a href="/top-growth-suburbs-victoria.html">Top Growth</a>
      <a href="/top-value-suburbs-victoria.html">Top Value</a>
      <a href="/top-yield-suburbs-victoria.html">Top Yield</a>
      <a href="/top-school-zone-suburbs-victoria.html">Top Schools</a>
      <a href="/contact.html">Contact</a>
    </div>
    <p>© ${new Date().getFullYear()} AusHomeValue — Australian Property Intelligence</p>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function factorTag(f) {
  const map = { growth: 'growth', value: 'value', yield: 'yield', school: 'school' };
  return map[f] || 'opp';
}

main().catch(e => { console.error(e); process.exit(1); });
