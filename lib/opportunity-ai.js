/**
 * opportunity-ai.js — AI Explanation Layer (Phase 5)
 *
 * Generates human-readable explanations for each suburb.
 * Rule-based (no LLM call needed — deterministic, fast, no cost).
 */

export function generateExplanation(suburb, metrics) {
  if (!metrics) {
    return {
      summary: `${suburb} is a developing property market with limited available data.`,
      whyRanked: 'Insufficient data to determine ranking drivers.',
      investorNotes: 'Further research recommended — visit AusHomeValue for address-level valuation.',
      risks: ['Limited comparable sales', 'Developing market data profile'],
      suitableProfile: 'Early-stage investors comfortable with emerging markets',
    };
  }

  const score = metrics.opportunity_score;
  const type = metrics.opportunity_type || 'Balanced';
  const g3 = metrics.growth_3y;
  const hp = metrics.median_house_price;
  const sch = metrics.school_score;
  const infra = metrics.infrastructure_score;
  const population = metrics.population_growth;

  // ── Why this suburb ranks highly ──
  const rankReasons = [];
  if (score >= 75) rankReasons.push(`${suburb} achieves a top-tier opportunity score of ${score}/100, placing it among the highest-ranked suburbs in our analysis.`);
  else if (score >= 60) rankReasons.push(`${suburb} achieves a solid opportunity score of ${score}/100, indicating above-average investment potential.`);
  else rankReasons.push(`${suburb} scores ${score}/100, reflecting a developing market opportunity profile.`);

  if (g3 != null && g3 > 0) {
    rankReasons.push(`The experimental market momentum signal is ${g3}; it is not a measured three-year return or price forecast.`);
  } else if (g3 != null) {
    rankReasons.push(`The experimental market momentum signal is ${g3}; it is not a measured three-year return or price forecast.`);
  }
  if (sch >= 75) rankReasons.push('The school zone is rated highly, attracting family buyers and supporting long-term demand.');
  else if (sch >= 60) rankReasons.push('School quality is above average, contributing to the suburb\'s residential appeal.');
  if (infra >= 65) rankReasons.push('Infrastructure investment in the area supports future growth potential.');

  // ── Investor notes ──
  const notes = [];
  if (hp) {
    notes.push(`Median house price is approximately $${(hp / 1000).toFixed(0)}K.`);
    if (hp < 600000) notes.push('This is an entry-level price point suitable for first-time investors or those seeking lower capital outlay.');
    else if (hp < 1000000) notes.push('Mid-market pricing offers a balance of growth potential and affordability.');
    else notes.push('Premium pricing — investors should focus on capital growth rather than yield.');
  }
  if (type.includes('Growth')) notes.push('The suburb is classified as a Growth Opportunity, best suited to capital appreciation strategies.');
  if (type.includes('Cashflow')) notes.push('Classified as a Cashflow Opportunity — rental yield is a key driver here.');
  if (type.includes('School')) notes.push('Classified as a School Zone Opportunity — proximity to quality schools supports sustained demand.');
  if (type.includes('Value')) notes.push('Classified as a Value Opportunity — priced below suburb median, offering potential upside.');
  if (type.includes('Infrastructure')) notes.push('Infrastructure investment in the region supports medium-to-long-term value growth.');
  if (population != null) notes.push(`Population growth of ${population}% suggests${population >= 2 ? ' strong ' : ' moderate '}demand for housing.`);

  // ── Risks ──
  const riskList = [];
  if (g3 != null && g3 < -5) riskList.push('The experimental momentum signal is weak; it is not a measured three-year price decline.');
  if (g3 != null && g3 > 20) riskList.push('The experimental momentum signal is elevated; it is not a measured return or price forecast.');
  if (score < 50) riskList.push('Below-average opportunity score suggests limited near-term catalysts.');
  if (infra != null && infra < 40) riskList.push('Limited infrastructure pipeline reduces growth tailwinds.');
  if (riskList.length === 0) riskList.push('No major risk indicators identified in current data.');

  // ── Suitable investor profile ──
  let profile;
  if (type.includes('Growth') || type.includes('Infrastructure')) {
    profile = 'Growth-oriented investors with a 5-10 year holding horizon who can tolerate moderate short-term volatility.';
  } else if (type.includes('Cashflow')) {
    profile = 'Income-focused investors seeking steady rental returns with moderate capital appreciation.';
  } else if (type.includes('School')) {
    profile = 'Family-focused long-term investors who prioritise capital preservation and education-driven demand.';
  } else if (type.includes('Value')) {
    profile = 'Value investors and first-time property buyers looking for entry points below suburb median pricing.';
  } else {
    profile = 'Balanced investors looking for a diversified property exposure with moderate risk-return profile.';
  }

  return {
    summary: rankReasons.join(' '),
    whyRanked: rankReasons.slice(0, 2).join(' '),
    investorNotes: notes.join(' '),
    risks: riskList,
    suitableProfile: profile,
  };
}
