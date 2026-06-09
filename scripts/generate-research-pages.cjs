#!/usr/bin/env node
/**
 * generate-research-pages.cjs — Track C Research Centre V1
 *
 * Generates 5 SEO-first, GEO-first, AI-citation-friendly static HTML pages
 * under public/research/ with enhanced methodology sections, JSON-LD ItemList,
 * and mobile-first responsive design.
 *
 * Usage:
 *   node scripts/generate-research-pages.cjs
 *
 * Output:
 *   public/research/top-growth-suburbs-victoria-2026.html
 *   public/research/top-value-suburbs-victoria-2026.html
 *   public/research/top-yield-suburbs-victoria-2026.html
 *   public/research/top-school-zone-suburbs-victoria-2026.html
 *   public/research/top-supply-constrained-suburbs-victoria-2026.html
 */

const BASE = 'https://aushomevalue.vercel.app';
const CANONICAL = 'https://www.aushomevalue.com.au';
const fs = require('fs');
const path = require('path');

// Try to load dotenv for DB access
let neon;
try {
  require('dotenv').config();
  neon = require('@neondatabase/serverless').neon;
} catch {
  neon = null;
}

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const RESEARCH_DIR = path.join(PUBLIC_DIR, 'research');

// ── Page Definitions ──

const PAGES = [
  {
    slug: 'top-growth-suburbs-victoria-2026',
    title: 'Top 100 Growth Suburbs Victoria 2026 — Best Property Growth Areas',
    h1: 'Top 100 Growth Suburbs in Victoria — 2026 Rankings',
    desc: 'Victoria\'s highest-growth suburbs ranked by weighted 1, 3 and 5-year price appreciation. Data-driven analysis for investors seeking capital growth opportunities in the Victorian property market.',
    seo: 'Top 100 growth suburbs in Victoria for 2026. Ranked by weighted 1, 3 and 5-year price growth with confidence-adjusted scores. Data from ABS, VGV and DEWR SALM.',
    apiSlug: 'growth',
    icon: '📈',
    navLabel: 'Growth',
    tagClass: 'tag-growth',
    methodologyTitle: 'Growth Score Methodology',
    methodology: [
      'Growth scores are calculated from a weighted average of 1-year (25%), 3-year (50%) and 5-year (25%) median house price growth.',
      'Each suburb\'s raw growth rate is normalised to a 0–100 score using percentile ranking against all Victorian suburbs.',
      'The Opportunity Score factors in growth momentum, supply constraints, and population tailwinds to identify suburbs with sustained appreciation potential.',
      'Confidence calibration adjusts for data recency, transaction volume, and statistical significance — scores with insufficient sales data receive lower confidence.',
      'Data sources: ABS Census (population/demographics), Victorian Government Valuer-General (sales data), DEWR SALM (labour market indicators).'
    ],
    subtitle: 'Suburbs with the strongest forecast price appreciation — sustained 1–5 year capital growth momentum driven by infrastructure investment, demographic shifts, and supply constraints.',
  },
  {
    slug: 'top-value-suburbs-victoria-2026',
    title: 'Top 100 Value Suburbs Victoria 2026 — Most Affordable Property Markets',
    h1: 'Top 100 Value Suburbs in Victoria — 2026 Rankings',
    desc: 'Victoria\'s best-value suburbs ranked by affordability and upside potential. Find below-median entry points with strong growth corridors — ideal for first-home buyers and value-conscious investors.',
    seo: 'Top 100 value suburbs in Victoria for 2026. Affordable median prices, growth corridors and infrastructure tailwinds. Ranked by price-to-value ratio with confidence scores.',
    apiSlug: 'value',
    icon: '💎',
    navLabel: 'Value',
    tagClass: 'tag-value',
    methodologyTitle: 'Value Score Methodology',
    methodology: [
      'Value scores are based on median house price relative to the Melbourne metropolitan median — suburbs priced well below median receive higher scores.',
      'A price-to-value ratio is calculated comparing each suburb\'s median price against its growth potential, school quality, and infrastructure investment pipeline.',
      'Suburbs in designated Growth Corridors (Werribee, Cranbourne, Casey, Melton) receive additional weight due to government-backed development and transport investment.',
      'The Opportunity Score incorporates long-term capital growth outlook and supply-demand dynamics to distinguish genuine value from value traps.',
      'Data sources: VGV property sales data, Victorian Planning Authority growth corridor designations, Department of Transport infrastructure pipeline.'
    ],
    subtitle: 'The most affordable entry points in the Victorian property market — below-median pricing with strong upside potential for first-home buyers and value-conscious investors.',
  },
  {
    slug: 'top-yield-suburbs-victoria-2026',
    title: 'Top 100 Rental Yield Suburbs Victoria 2026 — Best Cash Flow Property',
    h1: 'Top 100 Rental Yield Suburbs in Victoria — 2026 Rankings',
    desc: 'Victoria\'s highest gross rental yield suburbs ranked for cash-flow-focused investors. Combine strong tenant demand with affordable purchase prices for compelling rental returns.',
    seo: 'Top 100 rental yield suburbs in Victoria for 2026. Gross yield rankings with vacancy context and growth projections. Cash-flow positive property investment opportunities.',
    apiSlug: 'yield',
    icon: '💰',
    navLabel: 'Yield',
    tagClass: 'tag-yield',
    methodologyTitle: 'Yield Score Methodology',
    methodology: [
      'Gross rental yield is calculated as (annual median rent × 52) ÷ median property price × 100.',
      'Yield scores are normalised on a 0–100 scale where yields above 6% score 80+, yields between 4–6% score 50–80, and yields below 3% score below 30.',
      'Vacancy rates are factored into the overall assessment — high-yield suburbs with very low vacancy rates receive confidence boosts; high-yield suburbs with elevated vacancy are downgraded.',
      'The Opportunity Score integrates yield sustainability indicators including population growth, employment trends, and dwelling supply pipeline.',
      'Data sources: rental bond data from Residential Tenancies Bond Authority, VGV sales data, DEWR SALM employment projections, ABS population estimates.'
    ],
    subtitle: 'Suburbs delivering the strongest gross rental yields across Victoria — compelling cash flow for investors combining tenant demand with affordable purchase prices.',
  },
  {
    slug: 'top-school-zone-suburbs-victoria-2026',
    title: 'Top 100 School Zone Suburbs Victoria 2026 — Best Education Catchments',
    h1: 'Top 100 School Zone Suburbs in Victoria — 2026 Rankings',
    desc: 'Victoria\'s highest-rated school catchment suburbs ranked by education quality scores. School zone premiums offer price insulation and consistent family-buyer demand.',
    seo: 'Top 100 school zone suburbs in Victoria for 2026. Ranked by school quality scores from ACARA/NAPLAN data. Family-friendly investment with price insulation and long-term demand.',
    apiSlug: 'school',
    icon: '🏫',
    navLabel: 'Schools',
    tagClass: 'tag-school',
    methodologyTitle: 'School Zone Score Methodology',
    methodology: [
      'School quality scores are derived from ACARA NAPLAN results, ICSEA values, and MySchool enrolment data for government and non-government primary and secondary schools.',
      'Each suburb is assigned a composite school score based on the highest-rated government school within its catchment zone.',
      'Suburbs with multiple high-performing school zones (e.g. Balwyn High, McKinnon Secondary, University High catchments) score higher due to catchment overlap premiums.',
      'The Opportunity Score measures the price premium attributable to school zone desirability — suburbs where school quality is undervalued rank higher.',
      'Data sources: ACARA MySchool (NAPLAN + ICSEA), DEWR SALM (demographic projections), VGV (sales data for school-zone price premium analysis).'
    ],
    subtitle: 'Suburbs with the highest-rated school catchments — these areas command family-buyer premiums and offer superior price insulation during market downturns.',
  },
  {
    slug: 'top-supply-constrained-suburbs-victoria-2026',
    title: 'Top 100 Supply-Constrained Suburbs Victoria 2026 — Lowest Housing Supply',
    h1: 'Top 100 Supply-Constrained Suburbs in Victoria — 2026 Rankings',
    desc: 'Victoria\'s most supply-constrained suburbs ranked by housing shortage intensity. Limited new development and strong demand create conditions for sustained price support.',
    seo: 'Top 100 supply-constrained suburbs in Victoria for 2026. Ranked by housing shortage intensity — limited land release, low dwelling growth, and strong demand support prices.',
    apiSlug: null, // special: direct DB query
    icon: '🔒',
    navLabel: 'Supply',
    tagClass: 'tag-supply',
    methodologyTitle: 'Supply Constraint Score Methodology',
    methodology: [
      'Supply constraint scores measure the degree to which housing supply fails to meet demand in each suburb.',
      'The composite score combines: housing per capita ratio, dwelling growth rate (negative = supply shrinking), growth corridor status, land release activity, and proximity to activity precincts.',
      'Higher scores indicate tighter supply — suburbs with limited developable land, established zoning restrictions, and strong population inflows rank highest.',
      'Suburbs in inner and middle-ring Melbourne (5–15 km from CBD) typically score higher due to infill constraints and mature zoning frameworks.',
      'Data sources: VGV subdivision data, Victorian Planning Authority land release mapping, ABS population projections, DEWR SALM housing needs assessment.'
    ],
    subtitle: 'Victoria\'s most supply-constrained suburbs — limited housing availability, low new dwelling completions, and strong underlying demand create conditions for sustained price support.',
  },
];

function slugify(suburb) {
  return suburb.toLowerCase().replace(/[\s.]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(val) {
  if (val == null) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  return '$' + Math.round(n / 1000) + 'K';
}

function formatPercent(val) {
  if (val == null) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return n >= 0 ? n.toFixed(1) + '%' : n.toFixed(1) + '%';
}

// ── Research Tab Navigation ──

function buildNavTabs(currentSlug) {
  return PAGES.map(p => {
    const active = p.slug === currentSlug ? ' tab-active' : '';
    const href = p.apiSlug
      ? `/research/${p.slug}.html`
      : `/research/${p.slug}.html`;
    return `        <a href="${href}" class="tab${active}">
          ${p.icon} ${p.navLabel}
        </a>`;
  }).join('\n');
}

// ── Methodology Section ──

function buildMethodology(page) {
  const points = page.methodology.map(m => `            <li>${escapeHtml(m)}</li>`).join('\n');
  return `
      <div class="methodology">
        <h2>${escapeHtml(page.methodologyTitle)}</h2>
        <p>These rankings are generated from the <a href="https://aushomevalue.vercel.app">AusHomeValue</a> property intelligence platform, which combines multiple government and market datasets to produce calibrated opportunity scores for every suburb in Victoria. Below is how this specific ranking is constructed.</p>
        <ol>
${points}
        </ol>
        <p class="methodo-note">Scores are updated as new sales data, census results, and planning information become available. Rankings reflect the latest available data as of June 2026.</p>
      </div>`;
}

// ── JSON-LD ItemList ──

function buildJsonLd(page, results, slug) {
  const items = results.map((r, i) => {
    return `    {
      "@type": "ListItem",
      "position": ${i + 1},
      "item": {
        "@type": "Place",
        "name": "${escapeHtml(r.suburb)}, Victoria",
        "url": "${CANONICAL}/suburb/${slugify(r.suburb)}-vic.html"
      }
    }`;
  }).join(',\n');

  return `{
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "${escapeHtml(page.h1)}",
    "description": "${escapeHtml(page.seo)}",
    "url": "${CANONICAL}/research/${slug}.html",
    "numberOfItems": ${results.length},
    "itemListOrder": "https://schema.org/ItemListOrderDescending",
    "itemListElement": [
${items}
    ],
    "about": {
      "@type": "Thing",
      "name": "Victorian Property Market Rankings"
    },
    "publisher": {
      "@type": "Organization",
      "name": "AusHomeValue",
      "url": "${CANONICAL}"
    }
  }`;
}

// ── Build Research Card ──

function buildCard(r, i, page) {
  const rank = i + 1;
  const suburbSlug = slugify(r.suburb);
  const suburbUrl = `/suburb/${suburbSlug}-vic.html`;

  // Build explanation bullets
  let explainHtml = '';
  if (r.explanations && r.explanations.length > 0) {
    const bullets = r.explanations.map(e => `<li>${escapeHtml(e)}</li>`).join('');
    explainHtml = `<ul class="explain-list">${bullets}</ul>`;
  }

  // For supply page, the factorScore maps from conf_supply_constraint
  let factorScore = r.factorScore;
  let factorTier = r.factorTier;
  let oppScore = r.opportunityScore;
  let confidence = r.overallConfidence;

  // Supply-constrained page uses conf_supply_constraint as the score
  if (page.apiSlug === null) {
    factorScore = r.conf_supply_constraint;
    factorTier = factorScore >= 70 ? 'A' : factorScore >= 55 ? 'B+' : factorScore >= 40 ? 'B' : 'C';
    oppScore = r.opportunity_score;
    confidence = r.overall_confidence;
  }

  const scoreDisplay = factorScore != null ? Math.round(factorScore) + '%' : '—';
  const tierDisplay = factorTier || '';
  const confidenceDisplay = confidence != null ? confidence.toFixed(1) + '%' : '—';
  const oppDisplay = oppScore != null ? `Opp ${Math.round(oppScore)}` : 'Opp —';
  const priceDisplay = formatPrice(r.medianPrice || r.median_house_price);

  return `
    <div class="rank-card" data-rank="${rank}">
      <div class="rank-number">${rank}</div>
      <div class="rank-body">
        <h3><a href="${suburbUrl}">${escapeHtml(r.suburb)}</a></h3>
        <div class="rank-meta">
          <span class="tag ${page.tagClass}">${page.icon} ${page.navLabel}</span>
          <span class="tag tag-opp">${oppDisplay}</span>
        </div>
        <div class="rank-stats">
          <div class="stat">
            <span class="stat-label">${page.navLabel}</span>
            <span class="stat-value">${scoreDisplay}</span>
            <span class="stat-tier">${tierDisplay}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Confidence</span>
            <span class="stat-value">${confidenceDisplay}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Median Price</span>
            <span class="stat-value">${priceDisplay}</span>
          </div>
        </div>
        ${explainHtml}
      </div>
    </div>`;
}

// ── Build Full HTML Page ──

function buildPage(page, results) {
  const slug = page.slug;
  const rows = results.map((r, i) => buildCard(r, i, page)).join('\n');
  const navTabs = buildNavTabs(slug);
  const methodologyHtml = buildMethodology(page);
  const jsonLd = buildJsonLd(page, results, slug);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(page.title)} | AusHomeValue Research</title>
  <meta name="description" content="${escapeHtml(page.seo)}" />
  <link rel="canonical" href="${CANONICAL}/research/${slug}.html" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.seo)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${CANONICAL}/research/${slug}.html" />
  <meta property="og:site_name" content="AusHomeValue" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(page.title)}" />
  <meta name="twitter:description" content="${escapeHtml(page.seo)}" />
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
    .topbar .inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; gap: 16px; }
    .topbar a { color: white; font-weight: 600; font-size: 1.1rem; }
    .topbar .back { opacity: 0.85; font-size: 0.95rem; }
    .topbar .back:hover { opacity: 1; text-decoration: none; }
    .container { max-width: 1080px; margin: 0 auto; padding: 32px 20px; }
    h1 { font-size: clamp(1.5rem, 4vw, 2.2rem); font-weight: 800; line-height: 1.25; margin-bottom: 12px; color: #0d2b24; }
    .page-desc { color: #4a5650; font-size: 1rem; max-width: 780px; margin-bottom: 8px; line-height: 1.7; }
    .tabs {
      display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 28px;
    }
    .tab {
      padding: 8px 18px; border-radius: 30px; font-size: 0.9rem; font-weight: 600;
      background: #e8f3ef; color: #0d6b57; transition: all 0.15s; white-space: nowrap;
    }
    .tab:hover { background: #d0e8e0; text-decoration: none; }
    .tab-active { background: #0d6b57; color: white; }

    /* ── Methodology ── */
    .methodology {
      background: white; border: 1px solid #dbe2de; border-radius: 12px;
      padding: 28px 24px; margin-bottom: 24px;
    }
    .methodology h2 {
      font-size: 1.3rem; font-weight: 700; margin-bottom: 14px; color: #0d2b24;
    }
    .methodology p {
      font-size: 0.92rem; color: #4a5650; line-height: 1.65; margin-bottom: 12px;
    }
    .methodology ol {
      margin: 8px 0 14px 20px; padding: 0;
    }
    .methodology ol li {
      font-size: 0.92rem; color: #3d4d47; line-height: 1.6; margin-bottom: 4px; padding-left: 4px;
    }
    .methodo-note {
      font-style: italic; font-size: 0.88rem; color: #8a9b93; margin-top: 8px;
    }

    /* ── Rank Cards ── */
    .rank-card {
      display: flex; gap: 16px;
      background: white; border: 1px solid #dbe2de; border-radius: 12px;
      padding: 20px; margin-bottom: 10px; transition: box-shadow 0.15s;
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
    .tag-supply { background: #f5e3e3; color: #7a1a1a; }
    .tag-opp { background: #f0f0f0; color: #555; }
    .rank-stats { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 8px; }
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

    /* ── Breadcrumb ── */
    .breadcrumb { font-size: 0.85rem; color: #66736d; margin-bottom: 20px; }
    .breadcrumb a { color: #0d6b57; }

    /* ── Footer ── */
    .footer {
      text-align: center; padding: 40px 20px; color: #8a9b93; font-size: 0.85rem;
      border-top: 1px solid #dbe2de; margin-top: 48px;
    }
    .foot-links { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-bottom: 8px; }
    .foot-links a { color: #4a5650; font-size: 0.85rem; }
    .foot-note { font-size: 0.8rem; color: #a0b0a8; margin-top: 12px; line-height: 1.6; }

    /* ── Mobile ── */
    @media (max-width: 640px) {
      .container { padding: 20px 14px; }
      .rank-card { flex-direction: column; padding: 14px; }
      .rank-number { width: 32px; height: 32px; font-size: 0.9rem; }
      .rank-stats { gap: 12px; }
      .methodology { padding: 18px 14px; }
    }
  </style>
  <script src="/opportunity-gate.js" defer></script>
  <script type="application/ld+json">
${jsonLd}
  </script>
</head>
<body>
  <div class="topbar">
    <div class="inner">
      <a href="/" class="back">← AusHomeValue</a>
      <span style="font-size:0.85rem;opacity:0.7">Research Centre</span>
    </div>
  </div>
  <div class="container">
    <div class="breadcrumb">
      <a href="/">Home</a> / <a href="/research/">Research</a> / ${page.icon} ${page.h1}
    </div>
    <h1>${escapeHtml(page.h1)}</h1>
    <p class="page-desc">${escapeHtml(page.subtitle)}</p>
    <div class="tabs">
${navTabs}
    </div>
    ${methodologyHtml}
    <p class="rank-intro">
      Showing <strong>${results.length}</strong> Victorian suburbs ranked by ${page.navLabel.toLowerCase()} score.
      Scores combine market data, confidence calibrations, and factor-specific supply-demand analysis.
      <a href="/methodology.html">Learn about our overall methodology →</a>
    </p>
    <div class="rank-list">
${rows}
    </div>
  </div>
  <div class="footer">
    <div class="foot-links">
      <a href="/">Home</a>
      <a href="/research/top-growth-suburbs-victoria-2026.html">Growth</a>
      <a href="/research/top-value-suburbs-victoria-2026.html">Value</a>
      <a href="/research/top-yield-suburbs-victoria-2026.html">Yield</a>
      <a href="/research/top-school-zone-suburbs-victoria-2026.html">Schools</a>
      <a href="/research/top-supply-constrained-suburbs-victoria-2026.html">Supply</a>
      <a href="/contact.html">Contact</a>
    </div>
    <div class="foot-note">
      Data sources: Australian Bureau of Statistics (ABS) Census &amp; Population Estimates, Victorian Government Valuer-General (VGV) Property Sales, Department of Employment and Workplace Relations (DEWR) Small Area Labour Markets, Victorian Planning Authority Growth Corridor Mapping, ACARA MySchool NAPLAN Results, Residential Tenancies Bond Authority Rental Data.<br />
      This information is for general informational purposes only and does not constitute financial or property advice. Independent professional advice should be sought before making property investment decisions.
    </div>
    <p>© ${new Date().getFullYear()} AusHomeValue — Australian Property Intelligence</p>
  </div>
</body>
</html>`;
}

// ── Main ──

async function main() {
  console.log('🏗️  Research Centre V1 Page Generator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Ensure output directory
  if (!fs.existsSync(RESEARCH_DIR)) {
    fs.mkdirSync(RESEARCH_DIR, { recursive: true });
    console.log(`📁 Created ${RESEARCH_DIR}`);
  }

  for (const page of PAGES) {
    console.log(`\n─── ${page.h1} ───`);

    let results;

    if (page.apiSlug) {
      // Fetch from production API
      const url = `${BASE}/api/top-${page.apiSlug}?limit=50`;
      console.log(`  Fetching ${url}...`);
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`  ❌ FAIL ${url}: ${res.status} ${res.statusText}`);
        continue;
      }
      const json = await res.json();
      results = json.results;
      console.log(`  ✅ Fetched ${results.length} results`);
    } else {
      // Supply-constrained: query DB directly for real conf_supply_constraint data
      console.log(`  Querying DB for supply-constrained data...`);
      try {
        if (neon && process.env.DATABASE_URL) {
          const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
          const dbRows = await sql`
            SELECT suburb, state,
              conf_supply_constraint,
              supply_housing_per_capita,
              supply_dwelling_growth,
              supply_growth_corridor_score,
              supply_land_release_indicator,
              supply_precinct_proximity,
              opportunity_score,
              overall_confidence,
              median_house_price,
              median_unit_price,
              vacancy_rate,
              growth_1y, growth_3y, growth_5y,
              gross_yield
            FROM suburb_metrics
            WHERE state = 'VIC'
              AND conf_supply_constraint IS NOT NULL
            ORDER BY conf_supply_constraint DESC
            LIMIT 50
          `;
          // Map DB rows to the format buildCard expects
          results = dbRows.map(r => ({
            suburb: r.suburb,
            state: r.state || 'VIC',
            factorScore: Number(r.conf_supply_constraint),
            factorTier: null, // computed in buildCard
            opportunityScore: Number(r.opportunity_score),
            overallConfidence: Number(r.overall_confidence),
            medianPrice: Number(r.median_house_price) || Number(r.median_unit_price),
            conf_supply_constraint: Number(r.conf_supply_constraint),
            opportunity_score: Number(r.opportunity_score),
            overall_confidence: Number(r.overall_confidence),
            median_house_price: Number(r.median_house_price),
            median_unit_price: Number(r.median_unit_price),
            vacancy_rate: Number(r.vacancy_rate),
            growth_1y: Number(r.growth_1y),
            growth_3y: Number(r.growth_3y),
            growth_5y: Number(r.growth_5y),
            gross_yield: Number(r.gross_yield),
            supply_housing_per_capita: Number(r.supply_housing_per_capita),
            supply_dwelling_growth: Number(r.supply_dwelling_growth),
            supply_growth_corridor_score: Number(r.supply_growth_corridor_score),
            supply_land_release_indicator: Number(r.supply_land_release_indicator),
            supply_precinct_proximity: Number(r.supply_precinct_proximity),
            // Generate supply-specific explanations
            explanations: [
              `Housing supply constraint score of ${Number(r.conf_supply_constraint).toFixed(0)} indicates ${
                Number(r.conf_supply_constraint) >= 60 ? 'severe supply tightness — limited new dwelling completions support price growth' :
                Number(r.conf_supply_constraint) >= 50 ? 'moderate supply constraint — development is occurring but demand still outpaces supply' :
                'lower supply constraint — land availability may moderate price growth'
              }`,
              `Dwelling growth: ${Number(r.supply_dwelling_growth).toFixed(0)}% — ${
                Number(r.supply_dwelling_growth) >= 70 ? 'strong new supply pipeline that could ease price pressure' :
                Number(r.supply_dwelling_growth) >= 40 ? 'moderate development activity balancing supply and demand' :
                'low development pipeline reinforcing supply scarcity'
              }`,
              Number(r.vacancy_rate) != null
                ? `Vacancy rate of ${Number(r.vacancy_rate).toFixed(1)}% — ${
                    Number(r.vacancy_rate) <= 3 ? 'extremely tight rental market with strong tenant demand' :
                    Number(r.vacancy_rate) <= 5 ? 'balanced rental market with healthy demand' :
                    'elevated vacancy levels signalling potential rental oversupply'
                  }`
                : 'Limited vacancy data available'
            ],
          }));
          console.log(`  ✅ Fetched ${results.length} supply-constrained results from DB`);
        } else {
          throw new Error('DB client unavailable');
        }
      } catch (e) {
        console.log(`  ⚠️ DB query failed: ${e.message}. Using growth data sorted by supplyScore as fallback.`);
        const fallbackRes = await fetch(`${BASE}/api/top-growth?limit=50`);
        if (!fallbackRes.ok) throw new Error(`Fallback failed: ${fallbackRes.status}`);
        const fallbackJson = await fallbackRes.json();
        results = [...fallbackJson.results].sort((a, b) => (b.supplyScore || 0) - (a.supplyScore || 0));
        results = results.map(r => ({ ...r, factorScore: r.supplyScore }));
        console.log(`  ✅ Fallback: sorted ${results.length} by supply score`);
      }
    }

    if (!results || results.length === 0) {
      console.error(`  ❌ No results for ${page.slug}`);
      continue;
    }

    // Build the HTML
    const html = buildPage(page, results);
    const outPath = path.join(RESEARCH_DIR, `${page.slug}.html`);
    fs.writeFileSync(outPath, html, 'utf-8');
    console.log(`  ✅ Wrote ${outPath} (${(html.length / 1024).toFixed(0)} KB)`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Research Centre V1 generation complete!\n');
}

main().catch(e => {
  console.error('\n❌ Fatal:', e.message);
  process.exit(1);
});
