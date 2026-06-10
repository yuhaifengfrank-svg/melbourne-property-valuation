/**
 * update-trust-layer.mjs — Apply trust-layer v2 enhancements
 * 
 * Adds:
 * 1. Confidence explanation text (tier-based)
 * 2. Investment suitability (4 investor types)
 * 3. Relevant CSS classes
 * 
 * Run: node update-trust-layer.mjs
 */

import fs from 'fs';
import path from 'path';

const filePath = process.argv[2] || '/Users/FrankAI/Documents/澳洲房地产评估系统/public/trust-layer.js';
let content = fs.readFileSync(filePath, 'utf8');
const orig = content;

// ── Edit 1: Add confidence explanation after </ul> ──
const afterUl = `h += '</ul>';

    // Confidence explanation
    var confExp = '';
    if (conf >= 75) {
      confExp = isZh ? '基于充分的近期成交证据和多个验证数据集，数据可靠性高。' : 'Based on strong recent sales evidence and multiple verified datasets.';
    } else if (conf >= 50) {
      confExp = isZh ? '基于成交数据与郊区建模相结合，数据可靠性中等。' : 'Based on a mix of sales evidence and suburb-level modelling.';
    } else {
      confExp = isZh ? '近期成交数据有限，估值更多依赖建模假设。' : 'Limited recent sales data. Estimate relies more heavily on modelled assumptions.';
    }
    h += '<p class="trust-conf-explanation">' + confExp + '</p>';

    if (factorData.length) {`;

content = content.replace(
  "h += '</ul>';\n\n    if (factorData.length) {",
  afterUl
);

// ── Edit 2: Add buildSuitabilityHTML function before Main entry ──
const suitFunc = `
  /* Investment Suitability */
  function buildSuitabilityHTML(data, lang) {
    var isZh = lang === 'zh';
    var factors = data.factors || [];
    var raw = data.rawData || {};
    var g3 = raw.growth_3y;
    var gScore = 0, yScore = 0, sScore = 0, vScore = 0;
    var medPrice = raw.median_house_price || raw.median_unit_price;
    var detached = raw.dwelling_separate_house;
    var yieldRaw = raw.gross_yield;
    for (var si = 0; si < factors.length; si++) {
      var f = factors[si];
      if (f.key === 'growth') gScore = f.score || 0;
      if (f.key === 'yield') yScore = f.score || 0;
      if (f.key === 'school') sScore = f.score || 0;
      if (f.key === 'value') vScore = f.score || 0;
    }

    function fmtPx(val) {
      if (!val || val <= 0) return '';
      if (val >= 1000000) return '$' + (val / 1000000).toFixed(2) + 'M';
      if (val > 0) return '$' + Number(val).toLocaleString();
      return '';
    }

    var types = [
      {
        key: 'growth',
        label: isZh ? '增长型投资者' : 'Growth Investors',
        icon: String.fromCodePoint(0x1F4C8),
        test: function() {
          var gv = (g3 != null) ? Number(g3).toFixed(1) : '—';
          if (gScore >= 55 || (g3 != null && g3 >= 15))
            return { v: 'yes', r: isZh ? '3年复合增长率' + gv + '% — 强劲资本增值潜力' : gv + '% 3yr CAGR — strong capital growth trajectory' };
          if (gScore >= 40 || (g3 != null && g3 >= 5))
            return { v: 'maybe', r: isZh ? '增长' + gScore + '分 — 中等，供应约束可支撑价格' : 'Growth score ' + gScore + ' — moderate, supply may support pricing' };
          return { v: 'no', r: isZh ? '增长率低 — 资本增值空间有限' : 'Low growth trajectory — limited appreciation potential' };
        }
      },
      {
        key: 'yield',
        label: isZh ? '收益型投资者' : 'Yield Investors',
        icon: String.fromCodePoint(0x1F4B0),
        test: function() {
          var yv = (yieldRaw != null) ? Number(yieldRaw).toFixed(2) + '%' : '—';
          if (yScore >= 55 || (yieldRaw != null && yieldRaw >= 4))
            return { v: 'yes', r: isZh ? '毛租金收益率' + yv + ' — 健康的租金回报' : 'Gross yield ' + yv + ' — healthy rental return' };
          if (yScore >= 40 || (yieldRaw != null && yieldRaw >= 3))
            return { v: 'maybe', r: isZh ? '收益率中等，需求稳定' : 'Yield moderate with stable demand' };
          return { v: 'no', r: isZh ? '收益率' + yv + ' — 低于3%门槛' : 'Yield ' + yv + ' — below 3% threshold' };
        }
      },
      {
        key: 'family',
        label: isZh ? '家庭' : 'Families',
        icon: String.fromCodePoint(0x1F46A),
        test: function() {
          if (sScore >= 60)
            return { v: 'yes', r: isZh ? '学区评分' + sScore + ' — 高于平均水平的学区' : 'School score ' + sScore + ' — above-average school zone' };
          if (sScore >= 40 && (detached != null && detached >= 60))
            return { v: 'maybe', r: isZh ? '学区中等，独立屋占比' + Number(detached).toFixed(0) + '%' : 'Moderate schools + ' + Number(detached).toFixed(0) + '% detached homes' };
          return { v: 'no', r: isZh ? '学区数据不足或低于平均水平' : 'Limited school data or below-average zones' };
        }
      },
      {
        key: 'fhb',
        label: isZh ? '首次购房者' : 'First Home Buyers',
        icon: String.fromCodePoint(0x1F3E0),
        test: function() {
          if (medPrice && medPrice < 600000)
            return { v: 'yes', r: isZh ? '中位价' + fmtPx(medPrice) + ' — 极具可负担性' : 'Median ' + fmtPx(medPrice) + ' — highly affordable entry' };
          if (vScore >= 55 || (medPrice && medPrice < 850000))
            return { v: 'maybe', r: isZh ? '中位价' + fmtPx(medPrice) + ' — 中等，低于墨尔本中位数' : 'Median ' + fmtPx(medPrice) + ' — moderate, below Melbourne median' };
          return { v: 'no', r: isZh ? '中位价' + fmtPx(medPrice) + ' — 超出首次购房者范围' : 'Median ' + fmtPx(medPrice) + ' — beyond FHB range' };
        }
      }
    ];

    var h = '<div class="trust-suitability">';
    h += '<h4 class="trust-suitability-title">' + (isZh ? '投资适宜性' : 'Investment Suitability') + '</h4>';
    h += '<div class="trust-investor-list">';
    for (var ti = 0; ti < types.length; ti++) {
      var t = types[ti];
      var result = t.test();
      var badgeClass = 'trust-investor-' + result.v;
      var labelMap = result.v === 'yes'
        ? (isZh ? '推荐' : 'Recommended')
        : result.v === 'maybe'
          ? (isZh ? '可行' : 'Possible')
          : (isZh ? '不推荐' : 'Not ideal');
      h += '<div class="trust-investor-row">';
      h += '<span class="trust-investor-icon">' + t.icon + '</span>';
      h += '<span class="trust-investor-label">' + t.label + '</span>';
      h += '<span class="trust-investor-badge ' + badgeClass + '">' + labelMap.toUpperCase() + '</span>';
      h += '<p class="trust-investor-reason">' + result.r + '</p>';
      h += '</div>';
    }
    h += '</div></div>';
    return h;
  }

  /* Main entry */
  function render(container, opts) {`;

content = content.replace(
  "  /* ── Main entry ── */\n  function render(container, opts) {",
  suitFunc
);

// ── Edit 3: Wire suitability in renderWithData ──
content = content.replace(
  '        if (hasWhy) html += buildWhyHTML(confSummary, lang);',
  `        if (hasWhy) {
        html += buildWhyHTML(confSummary, lang);
        html += buildSuitabilityHTML(data, lang);
      }`
);

// ── Edit 4: Add CSS classes ──
const newCSS = `.trust-conf-explanation { font-size:0.82rem; color:var(--muted,#66736d); margin:0 0 0.75rem; padding:0; line-height:1.4; font-style:italic; }
.trust-suitability { margin-top:0.75rem; border-top:1px solid var(--line,#dbe2de); padding-top:0.75rem; }
.trust-suitability-title { font-size:0.85rem; font-weight:700; margin:0 0 0.5rem; color:var(--text,#1a1d1a); }
.trust-investor-list { display:grid; gap:6px; }
.trust-investor-row { display:grid; grid-template-columns:auto 1fr auto; gap:4px 8px; align-items:center; padding:3px 0; }
.trust-investor-icon { font-size:1rem; }
.trust-investor-label { font-size:0.82rem; font-weight:600; }
.trust-investor-badge { font-size:0.68rem; font-weight:700; padding:1px 7px; border-radius:20px; white-space:nowrap; }
.trust-investor-yes { background:#d1fae5; color:#065f46; }
.trust-investor-maybe { background:#fef3c7; color:#92400e; }
.trust-investor-no { background:#fce7f3; color:#9d174d; }
.trust-investor-reason { font-size:0.74rem; color:var(--muted,#66736d); grid-column:2 / -1; margin:0 0 2px; line-height:1.35; }
@media (max-width:480px) {
  .trust-investor-row { grid-template-columns:auto 1fr; }
  .trust-investor-badge { grid-column:1 / -1; justify-self:start; }
}`;

content = content.replace(
  '.trust-opp-sidebar.single { grid-template-columns:1fr; max-width:480px; }',
  '.trust-opp-sidebar.single { grid-template-columns:1fr; max-width:480px; }\n' + newCSS
);

if (content === orig) {
  console.log('ERROR: No changes applied. Check patterns.');
  process.exit(1);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK — trust-layer.js updated successfully');

// Count new features
const featCounts = {
  confExplanation: content.includes('conf-explanation') ? 1 : 0,
  buildSuitability: content.includes('buildSuitabilityHTML') ? 1 : 0,
  growthInvestor: content.includes('增长型投资者') || content.includes('Growth Investors') ? 1 : 0,
  yieldInvestor: content.includes('收益型投资者') || content.includes('Yield Investors') ? 1 : 0,
  families: content.includes('家庭') || content.includes('Families') ? 1 : 0,
  fhb: content.includes('首次购房者') || content.includes('First Home Buyers') ? 1 : 0,
  newCSS: content.includes('trust-investor-yes') ? 1 : 0,
  wiredSuitability: content.includes('buildSuitabilityHTML(data, lang)') ? 1 : 0,
};
console.log('Features:', JSON.stringify(featCounts, null, 2));
