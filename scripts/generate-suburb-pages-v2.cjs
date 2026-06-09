#!/usr/bin/env node
/**
 * generate-suburb-pages-v2.cjs — Phase 3B
 *
 * Upgraded suburb page generator.
 * Fetches factor breakdown from production API and builds
 * Opportunity Intelligence section with all 9 factor scores + explanations.
 *
 * Usage: node scripts/generate-suburb-pages-v2.cjs
 * Output: public/suburb/{slug}.html
 *
 * Phase 3C: Generates homepage preview blocks inline.
 */

const BASE = 'https://aushomevalue.vercel.app';
const fs = require('fs');
const path = require('path');

const OUT = 'public';

async function main() {
  // Fetch Top-50 from each factor for Phase 3C
  const growthTop50 = await fetchJSON('/api/top-growth?limit=50');
  const valueTop50 = await fetchJSON('/api/top-value?limit=50');
  const yieldTop50 = await fetchJSON('/api/top-yield?limit=50');
  const schoolTop50 = await fetchJSON('/api/top-school?limit=50');

  // Fetch suburb intelligence for all unique suburbs from top rankings
  const allSuburbs = new Map();

  console.log('Fetching suburb intelligence data...');
  const allLists = [growthTop50, valueTop50, yieldTop50, schoolTop50];
  for (const list of allLists) {
    for (const r of (list.results || [])) {
      if (allSuburbs.has(r.suburb)) continue;
      const data = await fetchJSON(`/api/suburb-intelligence?suburb=${encodeURIComponent(r.suburb)}`);
      if (data && data.suburb) {
        allSuburbs.set(data.suburb, data);
        if (allSuburbs.size % 20 === 0) process.stdout.write(`  ${allSuburbs.size}...\n`);
      }
    }
  }
  console.log(`  Total unique suburbs: ${allSuburbs.size}`);

  // Generate suburb pages
  const suburbDir = path.join(OUT, 'suburb');
  fs.mkdirSync(suburbDir, { recursive: true });

  let genCount = 0;
  for (const [suburb, data] of allSuburbs) {
    const slugRaw = suburb.toLowerCase().replace(/[\s.]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
    const filename = `${slugRaw}-vic.html`;
    const html = buildSuburbPage(data, suburb);
    fs.writeFileSync(path.join(suburbDir, filename), html, 'utf-8');
    genCount++;
  }
  console.log(`  Generated ${genCount} suburb pages`);

  // Generate homepage preview (Phase 3C preview)
  const homepagePreview = buildHomepagePreview(growthTop50, valueTop50, yieldTop50, schoolTop50);
  fs.writeFileSync(path.join(OUT, 'index-phase3c-preview.html'), homepagePreview, 'utf-8');
  console.log('  Generated index-phase3c-preview.html');
  console.log('\n✅ Done');
}

async function fetchJSON(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url}: ${res.status}`);
  return res.json();
}

function buildSuburbPage(data, suburb) {
  const state = data.state || 'VIC';
  const slug = suburb.toLowerCase().replace(/[\s.]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');

  // Factor data
  const factors = ['value', 'growth', 'yield', 'vacancy', 'school', 'income', 'population', 'supply', 'infrastructure'];
  const factorLabels = {
    value: 'Value Score', growth: 'Growth Score', yield: 'Yield Score', vacancy: 'Vacancy Score',
    school: 'School Score', income: 'Income Score', population: 'Population Score',
    supply: 'Supply Score', infrastructure: 'Infrastructure Score'
  };

  let factorCardsHtml = '';
  let whyHtml = '';

  for (const f of factors) {
    const d = data[f] || {};
    const score = d.score != null ? Math.round(d.score) : '—';
    const tier = d.tier || '';
    const raw = d.raw != null ? d.raw : '';
    const unavailable = d.unavailable || false;

    // Color for score range
    const scoreColor = score === '—' || unavailable ? '#999'
      : score >= 80 ? '#1a7a1a'
      : score >= 65 ? '#0d6b57'
      : score >= 50 ? '#b8860b'
      : '#cc4444';

    const explanations = data.explanations && data.explanations[f] ? data.explanations[f] : [];
    const explainHtml = explanations.length > 0
      ? `<ul class="factor-explain">${explanations.slice(0, 2).map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
      : '';

    // Why section — strongest factors drive why text
    if (score !== '—' && Number(score) >= 65 && explanations.length > 0) {
      whyHtml += `<div class="why-item">
        <strong>${factorLabels[f]} (${score}/${tier})</strong> — ${escapeHtml(explanations[0])}
      </div>`;
    }

    factorCardsHtml += `
    <div class="factor-card">
      <div class="factor-head">
        <span class="factor-label">${factorLabels[f]}</span>
        <span class="factor-score" style="color:${scoreColor}">${score}</span>
      </div>
      ${tier ? `<span class="factor-tier">${unavailable ? 'Data unavailable' : tier}</span>` : ''}
      ${explainHtml}
    </div>`;
  }

  // Overall confidence
  const confidence = data.overallConfidence != null ? Math.round(data.overallConfidence) : '—';

  // Navigation links to top pages
  const topLinks = [
    '/top-growth-suburbs-victoria.html',
    '/top-value-suburbs-victoria.html',
    '/top-yield-suburbs-victoria.html',
    '/top-school-zone-suburbs-victoria.html'
  ].map(u => `<a href="${u}" style="color:#0d6b57;font-size:0.85rem;display:inline-block;margin-right:12px;">${pageLabel(u)}</a>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(suburb)} Property Market Analysis & Opportunity Score | AusHomeValue</title>
  <meta name="description" content="Detailed property intelligence for ${escapeHtml(suburb)}, ${state}. ${confidence}/100 confidence. Factor breakdown: Value ${data.value?.score ?? '—'}, Growth ${data.growth?.score ?? '—'}, School ${data.school?.score ?? '—'}. Why this suburb scores—analysis from AusHomeValue." />
  <link rel="canonical" href="https://www.aushomevalue.com.au/suburb/${slug}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${escapeHtml(suburb)} Property Intelligence | AusHomeValue" />
  <meta property="og:description" content="Confidence ${confidence}/100. Growth ${data.growth?.score ?? '—'}, School ${data.school?.score ?? '—'}, Value ${data.value?.score ?? '—'}, Infrastructure ${data.infrastructure?.score ?? '—'}. Full factor breakdown with explanations." />
  <meta property="og:url" content="https://www.aushomevalue.com.au/suburb/${slug}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, system-ui, -apple-system, sans-serif; background: #f4f6f5; color: #17211d; line-height: 1.6; }
    a { color: #0d6b57; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .topbar { background: linear-gradient(135deg, #0d6b57 0%, #0a8f6e 100%); color: white; padding: 14px 24px; position: sticky; top: 0; z-index: 100; }
    .topbar a { color: white; font-weight: 600; font-size: 1.1rem; }
    .topbar .back { opacity: 0.85; }
    .container { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    h1 { font-size: clamp(1.4rem, 4vw, 2rem); font-weight: 800; line-height: 1.2; margin-bottom: 8px; }
    .breadcrumb { font-size: 0.85rem; color: #66736d; margin-bottom: 20px; }
    .breadcrumb a { color: #0d6b57; }
    .confidence-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; flex-wrap: wrap; }
    .conf-badge { background: #0d6b57; color: white; border-radius: 30px; padding: 8px 20px; font-size: 1.5rem; font-weight: 700; }
    .conf-badge.high { background: #1a7a1a; }
    .conf-badge.medium { background: #b8860b; }
    .conf-badge.low { background: #cc4444; }
    .conf-label { font-size: 0.85rem; color: #66736d; }
    .top-links { margin-bottom: 24px; }
    .section-title { font-size: 1.3rem; font-weight: 700; margin: 36px 0 16px 0; }
    .section-subtitle { color: #4a5650; margin-bottom: 20px; }
    .factor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; margin-bottom: 8px; }
    .factor-card {
      background: white; border: 1px solid #dbe2de; border-radius: 10px; padding: 16px;
      transition: box-shadow 0.15s;
    }
    .factor-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
    .factor-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .factor-label { font-size: 0.85rem; color: #66736d; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 600; }
    .factor-score { font-size: 1.4rem; font-weight: 800; }
    .factor-tier { font-size: 0.8rem; color: #66736d; display: block; margin-bottom: 6px; }
    .factor-explain { list-style: none; padding: 0; margin: 6px 0 0; }
    .factor-explain li { font-size: 0.82rem; color: #4a5650; padding-left: 14px; position: relative; margin-bottom: 2px; line-height: 1.4; }
    .factor-explain li::before { content: '→'; position: absolute; left: 0; color: #0d6b57; }
    .why-section { background: white; border: 1px solid #dbe2de; border-radius: 10px; padding: 20px; margin-bottom: 32px; }
    .why-item { padding: 10px 0; border-bottom: 1px solid #f0f2f0; font-size: 0.9rem; line-height: 1.5; }
    .why-item:last-child { border-bottom: none; }
    .why-item strong { color: #0d6b57; }
    .next-links { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 40px; }
    .next-link { background: white; border: 1px solid #dbe2de; border-radius: 8px; padding: 10px 18px; color: #0d6b57; font-size: 0.9rem; font-weight: 500; transition: all 0.12s; }
    .next-link:hover { background: #e8f3ef; border-color: #0d6b57; text-decoration: none; }
    .footer { text-align: center; padding: 40px 20px; color: #8a9b93; font-size: 0.85rem; border-top: 1px solid #dbe2de; margin-top: 48px; }
    .foot-links { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-bottom: 8px; }
    .foot-links a { color: #4a5650; font-size: 0.85rem; }
    .stamp { font-size: 0.8rem; color: #8a9b93; margin: 8px 0 16px; line-height: 1.5; }
    @media (max-width: 640px) {
      .container { padding: 20px 14px; }
      .factor-grid { grid-template-columns: 1fr; }
      .confidence-bar { gap: 8px; }
    }
  </style>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Place",
    "name": "${escapeHtml(suburb)}, ${escapeHtml(state)}",
    "description": "Property intelligence for ${escapeHtml(suburb)} — ${confidence}/100 confidence score across 9 investment factors.",
    "containedInPlace": { "@type": "State", "name": "${escapeHtml(state)}, Australia" },
    "additionalProperty": [
      ${['value','growth','yield','vacancy','school','income','population','supply','infrastructure'].map(f => {
        const v = data[f] || {};
        return `{ "@type": "PropertyValue", "name": "${factorLabels[f]}", "value": "${v.score ?? '—'}" }`;
      }).join(',\n      ')}
    ]
  }
  </script>
</head>
<body>
  <div class="topbar">
    <a href="/" class="back">← AusHomeValue</a>
  </div>
  <div class="container">
    <div class="breadcrumb">
      <a href="/">Home</a> / <a href="/opportunities/">Opportunities</a> / ${escapeHtml(suburb)}
    </div>
    <h1>${escapeHtml(suburb)}, ${escapeHtml(state)} — Property Intelligence</h1>
    <div class="stamp">AI-powered opportunity analysis based on 9 investment factors. Updated nightly from market data.</div>

    <div class="confidence-bar">
      <div class="conf-badge ${confidenceLevel(confidence)}">${confidence}</div>
      <div>
        <strong>Overall Intelligence Confidence</strong><br />
        <span class="conf-label">${confidenceWord(confidence)} confidence · ${confidenceText(confidence)}</span>
      </div>
    </div>

    <div class="top-links">
      ${topLinks}
    </div>

    <h2 class="section-title">📊 Factor Breakdown</h2>
    <p class="section-subtitle">9-factor analysis scored 0–100. Higher scores = stronger investment signal.</p>
    <div class="factor-grid">
      ${factorCardsHtml}
    </div>

    ${whyHtml ? `
    <h2 class="section-title">🏆 Why ${escapeHtml(suburb)} Scores Highly</h2>
    <div class="why-section">
      ${whyHtml}
    </div>` : ''}

    <div class="next-links">
      <a href="/top-growth-suburbs-victoria.html" class="next-link">📈 Top Growth Suburbs</a>
      <a href="/top-value-suburbs-victoria.html" class="next-link">💎 Top Value Suburbs</a>
      <a href="/top-yield-suburbs-victoria.html" class="next-link">💰 Top Yield Suburbs</a>
      <a href="/top-school-zone-suburbs-victoria.html" class="next-link">🏫 Top School Zones</a>
      <a href="/opportunities/" class="next-link">📋 All Opportunities</a>
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

// Phase 3C: Homepage preview
function buildHomepagePreview(growthTop, valueTop, yieldTop, schoolTop) {
  const previewBlocks = [];

  const sections = [
    { title: '📈 Top Growth Suburbs', icon: '📈', list: growthTop, slug: 'top-growth-suburbs-victoria' },
    { title: '💎 Top Value Suburbs', icon: '💎', list: valueTop, slug: 'top-value-suburbs-victoria' },
    { title: '💰 Top Yield Suburbs', icon: '💰', list: yieldTop, slug: 'top-yield-suburbs-victoria' },
    { title: '🏫 Top School Zone Suburbs', icon: '🏫', list: schoolTop, slug: 'top-school-zone-suburbs-victoria' },
  ];

  for (const sec of sections) {
    const items = sec.list.results || [];
    const top3 = items.slice(0, 3);

    const cards = top3.map((r, i) => {
      const slug = r.suburb.toLowerCase().replace(/[\s.]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
      const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
      return `<a href="/suburb/${slug}-vic.html" class="preview-card">
        <span class="preview-rank">${emoji}</span>
        <span class="preview-name">${escapeHtml(r.suburb)}</span>
        <span class="preview-score">${r.factorScore ?? '—'}</span>
      </a>`;
    }).join('');

    previewBlocks.push(`
    <div class="home-section">
      <div class="home-section-header">
        <h3>${sec.title}</h3>
        <a href="/${sec.slug}.html" class="view-all-link">View all →</a>
      </div>
      <div class="preview-strip">
        ${cards}
      </div>
    </div>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AusHomeValue Preview — Phase 3C</title>
  <meta name="description" content="Preview of homepage opportunity intelligence blocks." />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, system-ui, -apple-system, sans-serif; background: #f4f6f5; color: #17211d; line-height: 1.6; }
    a { color: #0d6b57; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .container { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    h2 { font-size: 1.6rem; font-weight: 800; margin-bottom: 8px; }
    .subhead { color: #4a5650; margin-bottom: 32px; }
    .home-section { margin-bottom: 36px; }
    .home-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .home-section-header h3 { font-size: 1.1rem; font-weight: 700; }
    .view-all-link { font-size: 0.85rem; color: #0d6b57; font-weight: 500; }
    .preview-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .preview-card {
      background: white; border: 1px solid #dbe2de; border-radius: 10px;
      padding: 14px; display: flex; flex-direction: column; gap: 6px;
      transition: all 0.12s; color: #17211d;
    }
    .preview-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); border-color: #0d6b57; text-decoration: none; }
    .preview-rank { font-size: 1.2rem; }
    .preview-name { font-size: 1rem; font-weight: 700; }
    .preview-score { font-size: 0.85rem; color: #0d6b57; font-weight: 600; }
    @media (max-width: 640px) {
      .preview-strip { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>🏘 AusHomeValue</h2>
    <p class="subhead">Data-driven opportunity intelligence for Victorian property investors.</p>

    ${previewBlocks.join('\n')}
  </div>
  <div class="footer" style="text-align:center;padding:32px 20px;color:#8a9b93;font-size:0.85rem;border-top:1px solid #dbe2de;">
    <p>Preview — Phase 3C Homepage Integration</p>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function confidenceLevel(conf) {
  if (conf >= 80) return 'high';
  if (conf >= 60) return 'medium';
  return 'low';
}

function confidenceWord(conf) {
  if (conf >= 80) return 'High';
  if (conf >= 60) return 'Medium';
  return 'Low';
}

function confidenceText(conf) {
  if (conf >= 80) return 'Strong data coverage and calibration';
  if (conf >= 60) return 'Adequate data with reasonable coverage';
  return 'Limited data — use as directional guide only';
}

function pageLabel(url) {
  const labels = {
    'top-growth-suburbs-victoria.html': '📈 Top Growth',
    'top-value-suburbs-victoria.html': '💎 Top Value',
    'top-yield-suburbs-victoria.html': '💰 Top Yield',
    'top-school-zone-suburbs-victoria.html': '🏫 Top Schools'
  };
  for (const [k, v] of Object.entries(labels)) {
    if (url.includes(k)) return v;
  }
  return url;
}

main().catch(e => { console.error(e); process.exit(1); });
