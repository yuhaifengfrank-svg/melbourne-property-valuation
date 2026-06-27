/**
 * compute-ai-summary.mjs — AI Investment Summary Engine
 *
 * Rule-based, explainable. Derives risk_score, conviction_score, tags,
 * drivers, risks, and verdicts from existing suburb_metrics fields.
 *
 * Usage:
 *   node scripts/compute-ai-summary.mjs [--suburb=Brighton|all]
 *   node scripts/compute-ai-summary.mjs --dry-run
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
config();

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

function n(v) { return v != null ? Number(v) : null; }

// ─── Risk Score ─────────────────────────────────────────────────────────
// 40% Supply Risk + 20% Vacancy + 20% Affordability + 20% Growth Stability
function computeRiskScore(m) {
  const supplyRisk = m.supply_risk_score != null ? m.supply_risk_score : 50;
  const vac = m.vacancy_rate_adjusted != null ? m.vacancy_rate_adjusted : 3.0;
  const vacancyRisk = Math.min(100, Math.round((vac / 10) * 100));
  const affInc = m.conf_income != null ? m.conf_income : 50;
  const affRisk = Math.round(100 - affInc);
  const gs = m.growth_score != null ? m.growth_score : 50;
  const growthStab = Math.round(Math.min(100, gs + 20));
  const raw = supplyRisk * 0.4 + vacancyRisk * 0.2 + affRisk * 0.2 + (100 - growthStab) * 0.2;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

// ─── Conviction Score ───────────────────────────────────────────────────
// Proportion of factors pointing in the same direction × directional clarity
function computeConvictionScore(m) {
  const factors = [];
  if (m.school_score != null) factors.push(m.school_score >= 65 ? 1 : -1);
  if (m.growth_score != null) factors.push(m.growth_score >= 40 ? 1 : -1);
  if (m.gross_yield != null) factors.push(m.gross_yield >= 3.0 ? 1 : -1);
  if (m.vacancy_rate_adjusted != null) factors.push(m.vacancy_rate_adjusted <= 3.0 ? 1 : -1);
  if (m.supply_risk_score != null) factors.push(m.supply_risk_score <= 50 ? 1 : -1);
  if (m.supply_is_growth_corridor != null) factors.push(m.supply_is_growth_corridor ? 1 : -1);
  if (m.dwelling_occupancy_rate != null) factors.push(m.dwelling_occupancy_rate >= 2.5 ? 1 : -1);
  if (m.conf_income != null) factors.push(m.conf_income >= 70 ? 1 : -1);
  if (factors.length === 0) return null;
  const pos = factors.filter(f => f === 1).length;
  const neg = factors.filter(f => f === -1).length;
  const total = factors.length;
  const dominant = Math.max(pos, neg);
  const ratio = dominant / total;
  const balance = Math.abs(pos - neg) / total;
  return Math.max(0, Math.min(100, Math.round(ratio * 100 * (0.5 + 0.5 * balance))));
}

// ─── Best For ──────────────────────────────────────────────────────────
function computeBestFor(m) {
  const t = [];
  if (m.school_score != null && m.school_score >= 70) t.push('Families');
  if (m.gross_yield != null && m.gross_yield >= 3.5) t.push('Cashflow Investors');
  if (m.gross_yield != null && m.gross_yield >= 4.5) t.push('Yield Seekers');
  if (m.growth_score != null && m.growth_score >= 65) t.push('Capital Growth Seekers');
  if (m.undervaluation != null && m.undervaluation < 0.9) t.push('Value Investors');
  if (m.median_house_price != null && m.median_house_price <= 800000) t.push('First Home Buyers');
  if (m.supply_constraint_score != null && m.supply_constraint_score >= 60) t.push('Long-term Holders');
  if (m.supply_is_growth_corridor) t.push('Development Plays');
  if (m.infrastructure_score != null && m.infrastructure_score >= 60) t.push('Infrastructure Plays');
  return t;
}

// ─── Not Ideal For ────────────────────────────────────────────────────
function computeNotIdealFor(m) {
  const t = [];
  if (m.vacancy_rate_adjusted != null && m.vacancy_rate_adjusted > 3.0) t.push('Cashflow Investors');
  if (m.supply_risk_score != null && m.supply_risk_score >= 65) t.push('Short-term Flippers');
  if (m.median_house_price != null && m.median_house_price > 2000000) t.push('First Home Buyers');
  if (m.growth_score != null && m.growth_score < 30) t.push('Capital Growth Seekers');
  if (m.school_score != null && m.school_score < 55) t.push('School-focused Families');
  if (m.supply_is_growth_corridor && m.supply_risk_score != null && m.supply_risk_score > 55) t.push('Risk-averse Investors');
  return t;
}

// ─── Key Drivers ──────────────────────────────────────────────────────
function computeKeyDrivers(m) {
  const d = [];
  if (m.school_score != null && m.school_score >= 65) d.push({ factor:'School Quality', value:`${Math.round(m.school_score)}/100` });
  if (m.gross_yield != null && m.gross_yield >= 3.0) d.push({ factor:'Rental Yield', value:`${m.gross_yield.toFixed(1)}%` });
  if (m.growth_score != null && m.growth_score >= 50) d.push({ factor:'Growth Momentum', value:`${m.growth_score >= 0 ? '+' : ''}${Math.round(m.growth_score)}` });
  if (m.vacancy_rate_adjusted != null && m.vacancy_rate_adjusted <= 2.5) d.push({ factor:'Low Vacancy', value:`${m.vacancy_rate_adjusted.toFixed(1)}%` });
  if (m.supply_risk_score != null && m.supply_risk_score <= 40) d.push({ factor:'Supply Constraint', value:`${Math.round(m.supply_risk_score)}/100` });
  if (m.infrastructure_score != null && m.infrastructure_score >= 55) d.push({ factor:'Infrastructure Investment', value:`${Math.round(m.infrastructure_score)}/100` });
  if (m.conf_income != null && m.conf_income >= 75) d.push({ factor:'Income Demographics', value:`${Math.round(m.conf_income)}/100` });
  if (m.dwelling_occupancy_rate != null && m.dwelling_occupancy_rate >= 2.6) d.push({ factor:'Household Occupancy', value:`${m.dwelling_occupancy_rate.toFixed(2)}` });
  if (m.supply_is_growth_corridor) d.push({ factor:'Growth Corridor', value:'Active' });
  return d;
}

// ─── Key Risks ────────────────────────────────────────────────────────
function computeKeyRisks(m) {
  const r = [];
  if (m.vacancy_rate_adjusted != null && m.vacancy_rate_adjusted > 3.0) r.push({ factor:'Elevated Vacancy', value:`${m.vacancy_rate_adjusted.toFixed(1)}%` });
  if (m.supply_risk_score != null && m.supply_risk_score >= 60) r.push({ factor:'Supply Oversupply Risk', value:`${Math.round(m.supply_risk_score)}/100` });
  if (m.gross_yield != null && m.gross_yield < 2.0) r.push({ factor:'Low Rental Yield', value:`${m.gross_yield.toFixed(1)}%` });
  if (m.growth_score != null && m.growth_score < 30) r.push({ factor:'Weak Growth Signal', value:`${m.growth_score >= 0 ? '' : ''}${Math.round(m.growth_score)}` });
  if (m.school_score != null && m.school_score < 55) r.push({ factor:'Below-Average School Zone', value:`${Math.round(m.school_score)}/100` });
  if (m.supply_dwelling_growth != null && m.supply_dwelling_growth > 10) r.push({ factor:'Rising Dwelling Supply', value:`${m.supply_dwelling_growth.toFixed(1)}%` });
  if (m.conf_income != null && m.conf_income < 60) r.push({ factor:'Weaker Income Profile', value:`${Math.round(m.conf_income)}/100` });
  if (m.dwelling_occupancy_rate != null && m.dwelling_occupancy_rate < 2.3) r.push({ factor:'Low Household Density', value:`${m.dwelling_occupancy_rate.toFixed(2)}` });
  return r;
}

// ─── Final Verdict (3×3×3 matrix) ─────────────────────────────────────
function computeVerdict(oppScore, riskScore, convScore) {
  const opp = oppScore >= 70 ? 'high' : oppScore >= 40 ? 'medium' : 'low';
  const risk = riskScore >= 65 ? 'high' : riskScore >= 35 ? 'medium' : 'low';
  const conv = convScore >= 70 ? 'high' : convScore >= 40 ? 'medium' : 'low';
  const matrix = {
    'high|low|high':'Strong Buy','high|low|medium':'Buy','high|medium|high':'Buy',
    'high|medium|medium':'Opportunistic Buy','high|high|high':'Opportunistic Buy',
    'high|high|medium':'Watchlist','high|low|low':'Watchlist','high|medium|low':'Watchlist','high|high|low':'Watchlist',
    'medium|low|high':'Buy','medium|low|medium':'Buy','medium|medium|high':'Buy',
    'medium|medium|medium':'Hold','medium|low|low':'Hold','medium|high|high':'Hold',
    'medium|medium|low':'Watchlist','medium|high|medium':'Watchlist','medium|high|low':'Watchlist',
    'low|low|high':'Hold','low|low|medium':'Hold','low|medium|high':'Hold',
    'low|medium|medium':'Watchlist','low|low|low':'Watchlist','low|high|high':'Watchlist',
    'low|high|medium':'Avoid','low|medium|low':'Avoid','low|high|low':'Avoid'
  };
  return matrix[`${opp}|${risk}|${conv}`] || 'Hold';
}

// ─── Build JSON Summary ───────────────────────────────────────────────
function buildSummaryJson(m, riskScore, convScore, verdict, drivers, risks, bestFor, notIdealFor) {
  return {
    suburb: m.suburb,
    computed_at: new Date().toISOString(),
    scoring_version: 'v1',
    risk_score: riskScore,
    conviction_score: convScore,
    best_for: bestFor,
    not_ideal_for: notIdealFor,
    key_drivers: drivers,
    key_risks: risks,
    final_verdict: verdict,
    conclusion_input: {
      opportunity_score: m.opportunity_score != null ? Math.round(m.opportunity_score) : null,
      risk_score: riskScore,
      conviction_score: convScore,
      final_verdict: verdict,
      factor_directions: {
        school: m.school_score != null ? (m.school_score >= 65 ? 'positive' : 'negative') : null,
        yield: m.gross_yield != null ? (m.gross_yield >= 3.0 ? 'positive' : 'negative') : null,
        growth: m.growth_score != null ? (m.growth_score >= 40 ? 'positive' : 'negative') : null,
        vacancy: m.vacancy_rate_adjusted != null ? (m.vacancy_rate_adjusted <= 3.0 ? 'positive' : 'negative') : null,
        supply: m.supply_risk_score != null ? (m.supply_risk_score <= 50 ? 'positive' : 'negative') : null,
        income: m.conf_income != null ? (m.conf_income >= 70 ? 'positive' : 'negative') : null,
        occupancy: m.dwelling_occupancy_rate != null ? (m.dwelling_occupancy_rate >= 2.5 ? 'positive' : 'negative') : null,
      },
      key_drivers: drivers.map(d => `${d.factor}: ${d.value}`),
      key_risks: risks.map(r => `${r.factor}: ${r.value}`),
      best_for: bestFor,
      not_ideal_for: notIdealFor,
    },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const suburbFilter = args.find(a => a.startsWith('--suburb='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');

  // Fetch rows — use exact match for named arg, or all for full run
  let rows;
  if (suburbFilter) {
    rows = await sql`SELECT * FROM suburb_metrics WHERE LOWER(suburb) = LOWER(${suburbFilter}) AND state = 'VIC'`;
  } else {
    rows = await sql`SELECT * FROM suburb_metrics WHERE opportunity_score IS NOT NULL ORDER BY opportunity_score DESC`;
  }

  console.log(`Processing ${rows.length} suburb(s)...`);

  for (const row of rows) {
    const NUMERIC_FIELDS = [
      'median_house_price','median_unit_price','median_house_rent','median_unit_rent',
      'gross_yield','vacancy_rate','growth_1y','growth_3y','growth_5y','school_score',
      'infrastructure_score','supply_risk_score','opportunity_score','conf_income',
      'supply_constraint_score','supply_dwelling_growth','supply_housing_stock',
      'supply_housing_per_capita','supply_employment_growth','supply_unemployment_rate',
      'dwelling_total','dwelling_occupancy_rate','dwelling_3br_plus',
      'vacancy_rate_adjusted','growth_score','undervaluation','conf_population','conf_infrastructure',
    ];
    const m = { suburb: row.suburb, state: row.state };
    m.supply_is_growth_corridor = row.supply_is_growth_corridor;
    for (const k of NUMERIC_FIELDS) m[k] = n(row[k]);

    const riskScore = computeRiskScore(m);
    const convScore = computeConvictionScore(m);
    const bestFor = computeBestFor(m);
    const notIdealFor = computeNotIdealFor(m);
    const drivers = computeKeyDrivers(m);
    const risks = computeKeyRisks(m);
    const verdict = computeVerdict(m.opportunity_score, riskScore, convScore);
    const summaryJson = buildSummaryJson(m, riskScore, convScore, verdict, drivers, risks, bestFor, notIdealFor);

    if (dryRun) {
      console.log(`\n── ${m.suburb} ──`);
      console.log(`  Risk: ${riskScore}/100 | Conviction: ${convScore}/100 | Verdict: ${verdict}`);
      console.log(`  Best For: ${bestFor.join(', ') || '—'}`);
      console.log(`  Not Ideal: ${notIdealFor.join(', ') || '—'}`);
      console.log(`  Drivers: ${drivers.map(d => `${d.factor} (${d.value})`).join(', ') || '—'}`);
      console.log(`  Risks: ${risks.map(r => `${r.factor} (${r.value})`).join(', ') || '—'}`);
    } else {
      await sql`
        UPDATE suburb_metrics
        SET risk_score = ${riskScore},
            conviction_score = ${convScore},
            ai_summary_json = ${JSON.stringify(summaryJson)}::jsonb,
            ai_summary_version = 'v1'
        WHERE LOWER(suburb) = LOWER(${m.suburb}) AND state = 'VIC'
      `;
      console.log(`  ✓ ${m.suburb}`);
    }
  }

  if (dryRun) console.log('\n(Dry run — no DB changes made)');
  console.log('Done.');
  process.exit(0);
}

main().catch(e => { console.error('Failed:', e); process.exit(1); });
