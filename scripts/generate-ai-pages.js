/**
 * generate-ai-pages.js — Phase 5 + 6
 *
 * Extends generated suburb pages with AI explanations.
 * Generates homepage integration snippet.
 */

import { neon } from '@neondatabase/serverless';
import { generateExplanation } from '../lib/opportunity-ai.js';
import fs from 'fs';
import path from 'path';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
const OUT = 'dist';

function slug(suburb, state) {
  return `${suburb.toLowerCase().replace(/\s+/g, '-')}-${(state || 'vic').toLowerCase()}`;
}

async function getTopSuburbs(limit) {
  const rows = await sql.query(
    'SELECT suburb, state, median_house_price, median_unit_price, median_house_rent, median_unit_rent, ' +
    'gross_yield, vacancy_rate, growth_1y, growth_3y, growth_5y, population_growth, ' +
    'school_score, infrastructure_score, supply_risk_score, opportunity_score, opportunity_type ' +
    'FROM suburb_metrics WHERE opportunity_score IS NOT NULL ' +
    'ORDER BY opportunity_score DESC LIMIT $1',
    [limit]
  );
  return rows;
}

async function generateAll() {
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '230', 10);
  const top = await getTopSuburbs(limit);
  console.log(`Adding AI explanations for ${top.length} suburbs...`);

  // Add AI explanations and regenerate suburb pages with full content
  for (const s of top) {
    const ai = generateExplanation(s.suburb, s);

    const filename = slug(s.suburb, s.state) + '.html';
    const filepath = path.join(OUT, 'suburb', filename);
    let html = fs.readFileSync(filepath, 'utf-8');

    // Inject AI section before </body>
    const aiSection = `
    <div style="margin-top: 40px; border-top: 1px solid #dbe2de; padding-top: 28px;">
      <h2>AI Market Analysis — ${s.suburb}</h2>
      <div class="card" style="margin-top: 16px;">
        <h3>Why ${s.suburb} Ranks This Way</h3>
        <p>${ai.whyRanked}</p>
      </div>
      <div class="card" style="margin-top: 12px;">
        <h3>What Investors Should Know</h3>
        <p>${ai.investorNotes}</p>
      </div>
      <div class="card" style="margin-top: 12px;">
        <h3>Key Risks</h3>
        <ul>${ai.risks.map(r => '<li>' + r + '</li>').join('')}</ul>
      </div>
      <div class="card" style="margin-top: 12px;">
        <h3>Suitable Investor Profile</h3>
        <p>${ai.suitableProfile}</p>
      </div>
    </div>
    `;
    html = html.replace('</body>', aiSection + '\n</body>');
    fs.writeFileSync(filepath, html);
    console.log(`  [ai] ${filename}`);
  }

  // Phase 6: Homepage integration snippet
  const homeCards = top.slice(0, 5).map(s => {
    const ai = generateExplanation(s.suburb, s);
    return {
      suburb: s.suburb,
      slug: slug(s.suburb, s.state),
      score: s.opportunity_score,
      type: s.opportunity_type || 'Balanced',
      summary: ai.whyRanked.substring(0, 120),
    };
  });

  // Data-aware fallback chains: try best available, fall back to top overall
  const growthSub = (() => {
    const withGrowth = top.filter(s => (s.growth_3y || 0) >= 5);
    if (withGrowth.length >= 3) return withGrowth.slice(0, 3);
    return top.filter(s => (s.median_house_price || 999999) < 700000).slice(0, 3);
  })();
  const yieldSub = (() => {
    return [...top].filter(s => s.gross_yield != null).sort((a, b) => (b.gross_yield || 0) - (a.gross_yield || 0)).slice(0, 3);
  })();
  const schoolSub = (() => {
    const withSchool = top.filter(s => (s.school_score || 0) >= 65);
    if (withSchool.length >= 3) return withSchool.slice(0, 3);
    return [...top].filter(s => s.school_score != null).sort((a, b) => (b.school_score || 0) - (a.school_score || 0)).slice(0, 3);
  })();
  const balancedSub = (() => {
    const withBal = top.filter(s => s.opportunity_type === 'Value');
    if (withBal.length >= 3) return withBal.slice(0, 3);
    return top.slice(0, 3);
  })();

  const topSections = [
    { title: 'Top Growth', color: '#065f46', items: growthSub.map(s => ({ name: s.suburb, slug: slug(s.suburb, s.state), score: s.opportunity_score, desc: (s.growth_3y != null ? s.growth_3y + '% 3yr growth' : 'Strong growth indicators') })) },
    { title: 'Top Yield', color: '#92400e', items: yieldSub.map(s => ({ name: s.suburb, slug: slug(s.suburb, s.state), score: s.opportunity_score, desc: (s.gross_yield != null ? s.gross_yield + '% gross yield' : 'Yield data pending') })) },
    { title: 'Top School Zone', color: '#1e40af', items: schoolSub.map(s => ({ name: s.suburb, slug: slug(s.suburb, s.state), score: s.opportunity_score, desc: 'School score ' + (s.school_score ? Math.round(s.school_score) : 'N/A') + '/100' })) },
    { title: 'Top Balanced', color: '#0d6b57', items: balancedSub.map(s => ({ name: s.suburb, slug: slug(s.suburb, s.state), score: s.opportunity_score, desc: (s.opportunity_type || 'Balanced') + ' · ' + (s.growth_3y != null ? s.growth_3y + '% 3yr' : 'Developing') })) },
  ];

  let sectionsHtml = '';
  for (const sec of topSections) {
    sectionsHtml += `<div><h3 style="color:${sec.color};">${sec.title}</h3>`;
    for (const item of sec.items) {
      sectionsHtml += `<div><a href="/suburb/${item.slug}.html">${item.name}</a> <span style="background:${sec.color};color:white;border-radius:20px;padding:2px 8px;font-size:0.8rem;">${item.score}</span> <span style="color:#66736d;font-size:0.8rem;">${item.desc}</span></div>`;
    }
    sectionsHtml += `</div>`;
  }

  const homeSnippet = `<!-- Top Opportunities (Phase 6 — auto-generated) -->
<div id="top-opportunities" style="max-width:960px;margin:40px auto;padding:0 20px;">
  <h2>Top Opportunities</h2>
  <p style="color:#66736d;margin-bottom:20px;">Data-driven rankings refreshed nightly. Scores based on growth, school quality, rental yield, vacancy and undervaluation.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;">
    ${sectionsHtml}
  </div>
  <div style="text-align:center;margin-top:24px;"><a href="/opportunities/" style="background:#0d6b57;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View all opportunities →</a></div>
</div>`;

  fs.writeFileSync(path.join(OUT, 'top-opportunities-snippet.html'), homeSnippet);
  console.log('  [homepage] top-opportunities-snippet.html');
  console.log('\n✓ AI explanations added to ' + top.length + ' suburb pages + homepage snippet generated');
}

generateAll()
  .then(() => process.exit(0))
  .catch(e => { console.error('Generate failed:', e); process.exit(1); });
