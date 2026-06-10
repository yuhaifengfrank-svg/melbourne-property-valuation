/**
 * trust-layer.js — Reusable Trust Layer UI Component
 *
 * Provides three components:
 * 1. Methodology section (static HTML)
 * 2. Confidence card (dynamic, driven by API data)
 * 3. "Why This Suburb?" card (dynamic, driven by API data)
 *
 * Global namespace: window.TrustLayer
 * Usage:
 *   TrustLayer.render(el, { suburb: "Scoresby", language: "zh" });
 *   TrustLayer.getMethodologyHTML("en");
 *
 * No backend changes, no dataset modifications.
 */

(function(global) {
  'use strict';

  const METHODOLOGY = {
    en: `
<div class="trust-methodology">
  <details class="trust-details">
    <summary class="trust-summary">
      <span class="trust-icon">📋</span>
      <span>How the Opportunity Score Works</span>
    </summary>
    <div class="trust-body">
      <p>The Opportunity Score is calculated from 7 weighted factors, each normalised to 0-100:</p>
      <div class="trust-factors">
        <div class="trust-factor-bar">
          <span class="trust-factor-label">Undervaluation <em>27%</em></span>
          <span class="trust-bar-fill" style="width:27%"></span>
          <span class="trust-bar-desc">Affordability vs Melbourne median</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">School Quality <em>23%</em></span>
          <span class="trust-bar-fill" style="width:23%"></span>
          <span class="trust-bar-desc">ACARA NAPLAN / ICSEA scores</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">Growth Potential <em>20%</em></span>
          <span class="trust-bar-fill" style="width:20%"></span>
          <span class="trust-bar-desc">1yr/3yr/5yr weighted CAGR</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">Cashflow Yield <em>12%</em></span>
          <span class="trust-bar-fill" style="width:12%"></span>
          <span class="trust-bar-desc">Gross rental yield</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">Vacancy Demand <em>10%</em></span>
          <span class="trust-bar-fill" style="width:10%"></span>
          <span class="trust-bar-desc">Rental vacancy rate (inverted)</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">Data Confidence <em>5%</em></span>
          <span class="trust-bar-fill" style="width:5%"></span>
          <span class="trust-bar-desc">Source reliability & recency</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">Supply Constraint <em>3%</em></span>
          <span class="trust-bar-fill" style="width:3%"></span>
          <span class="trust-bar-desc">Land release & zoning tightness</span>
        </div>
      </div>

      <h4 style="font-size:0.9rem;margin:1rem 0 0.5rem;">Data Sources</h4>
      <div class="trust-source-grid">
        <div class="trust-source-item">
          <strong>REA / Domain</strong>
          <span>Comparable sales — price, type, land</span>
          <span class="trust-source-freq">Weekly</span>
        </div>
        <div class="trust-source-item">
          <strong>ABS 2021 Census</strong>
          <span>Demographics, income, dwellings</span>
          <span class="trust-source-freq">5-yearly</span>
        </div>
        <div class="trust-source-item">
          <strong>ACARA MySchool</strong>
          <span>School ICSEA & NAPLAN scores</span>
          <span class="trust-source-freq">Annual</span>
        </div>
        <div class="trust-source-item">
          <strong>Vic Valuer General</strong>
          <span>SA2 median prices, CAGR trends</span>
          <span class="trust-source-freq">Annual</span>
        </div>
        <div class="trust-source-item">
          <strong>SQM Research</strong>
          <span>Vacancy rates by suburb</span>
          <span class="trust-source-freq">Monthly</span>
        </div>
      </div>
    </div>
  </details>
</div>`,
    zh: `
<div class="trust-methodology">
  <details class="trust-details">
    <summary class="trust-summary">
      <span class="trust-icon">📋</span>
      <span>如何计算机会评分</span>
    </summary>
    <div class="trust-body">
      <p>机会评分由 7 项加权因子组成，每项归一化为 0-100 分：</p>
      <div class="trust-factors">
        <div class="trust-factor-bar">
          <span class="trust-factor-label">价值低估 <em>27%</em></span>
          <span class="trust-bar-fill" style="width:27%"></span>
          <span class="trust-bar-desc">与墨尔本中位数对比的可负担性</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">学区质量 <em>23%</em></span>
          <span class="trust-bar-fill" style="width:23%"></span>
          <span class="trust-bar-desc">ACARA NAPLAN / ICSEA 评分</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">增长潜力 <em>20%</em></span>
          <span class="trust-bar-fill" style="width:20%"></span>
          <span class="trust-bar-desc">1年/3年/5年加权复合增长率</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">现金流收益 <em>12%</em></span>
          <span class="trust-bar-fill" style="width:12%"></span>
          <span class="trust-bar-desc">总租金收益率</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">空置需求 <em>10%</em></span>
          <span class="trust-bar-fill" style="width:10%"></span>
          <span class="trust-bar-desc">租赁空置率（倒数）</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">数据置信度 <em>5%</em></span>
          <span class="trust-bar-fill" style="width:5%"></span>
          <span class="trust-bar-desc">数据源可靠性与时效性</span>
        </div>
        <div class="trust-factor-bar">
          <span class="trust-factor-label">供应约束 <em>3%</em></span>
          <span class="trust-bar-fill" style="width:3%"></span>
          <span class="trust-bar-desc">土地释放与规划控制</span>
        </div>
      </div>

      <h4 style="font-size:0.9rem;margin:1rem 0 0.5rem;">数据来源</h4>
      <div class="trust-source-grid">
        <div class="trust-source-item">
          <strong>REA / Domain</strong>
          <span>可比成交 — 价格、类型、土地面积</span>
          <span class="trust-source-freq">每周</span>
        </div>
        <div class="trust-source-item">
          <strong>ABS 2021 人口普查</strong>
          <span>人口、收入、住房统计</span>
          <span class="trust-source-freq">五年</span>
        </div>
        <div class="trust-source-item">
          <strong>ACARA 学校评分</strong>
          <span>学校 ICSEA 与 NAPLAN 分数</span>
          <span class="trust-source-freq">每年</span>
        </div>
        <div class="trust-source-item">
          <strong>维州总估价署</strong>
          <span>SA2 中位价与复合增长率趋势</span>
          <span class="trust-source-freq">每年</span>
        </div>
        <div class="trust-source-item">
          <strong>SQM Research</strong>
          <span>郊区空置率</span>
          <span class="trust-source-freq">每月</span>
        </div>
      </div>
    </div>
  </details>
</div>`
  };

  const CSS = `
.trust-methodology { margin:1.5rem 0; max-width:720px; }
.trust-details { background:var(--panel,#fff); border:1px solid var(--line,#dbe2de); border-radius:8px; overflow:hidden; }
.trust-summary { cursor:pointer; font-weight:600; padding:1rem; display:flex; align-items:center; gap:8px; user-select:none; }
.trust-summary.small { font-weight:550; font-size:0.85rem; padding:0.75rem 1rem; }
.trust-summary:hover { background:var(--soft,#e8f3ef); }
.trust-icon { font-size:1.2rem; }
.trust-body { padding:0 1rem 1rem; }
.trust-factors { display:grid; gap:8px; margin:1rem 0; }
.trust-factor-bar { display:grid; grid-template-columns:minmax(180px,1fr) minmax(80px,1fr) 1fr; align-items:center; gap:8px; padding:4px 0; }
.trust-factor-label { font-size:0.85rem; font-weight:600; white-space:nowrap; }
.trust-factor-label em { font-style:normal; color:var(--accent,#0d6b57); font-weight:700; }
.trust-bar-fill { height:10px; background:var(--accent,#0d6b57); border-radius:5px; min-width:4%; }
.trust-bar-desc { font-size:0.78rem; color:var(--muted,#66736d); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.trust-source-grid { display:grid; gap:6px; margin:0.5rem 0; }
.trust-source-item { display:grid; grid-template-columns:1fr 2fr auto; gap:12px; align-items:center; padding:6px 8px; background:var(--soft,#e8f3ef); border-radius:6px; font-size:0.83rem; }
.trust-source-freq { background:var(--accent,#0d6b57); color:white; border-radius:20px; padding:1px 8px; font-size:0.7rem; font-weight:600; white-space:nowrap; }
.trust-confidence-card,
.trust-why-card { background:var(--panel,#fff); border:1px solid var(--line,#dbe2de); border-radius:8px; padding:1rem; }
.trust-confidence-card { margin-bottom:1rem; }
.trust-card-title { font-size:1rem; margin:0 0 0.75rem; display:flex; align-items:center; gap:6px; }
.trust-confidence-visual { display:flex; align-items:center; gap:12px; margin-bottom:0.75rem; }
.trust-dots { display:flex; gap:4px; flex-wrap:wrap; }
.trust-dot { width:16px; height:16px; border-radius:50%; background:var(--line,#dbe2de); }
.trust-dot-filled { background:var(--accent,#0d6b57); }
.trust-confidence-pct { font-size:1.6rem; font-weight:800; color:var(--accent,#0d6b57); }
.trust-based-on { font-size:0.85rem; font-weight:600; margin:0 0 0.5rem; color:var(--muted,#66736d); }
.trust-source-list { margin:0 0 0.75rem; padding:0 0 0 1.2rem; font-size:0.83rem; }
.trust-source-list li { margin-bottom:4px; }
.trust-breakdown-grid { padding:0.5rem 1rem 0.75rem; display:grid; gap:6px; }
.trust-breakdown-row { display:grid; grid-template-columns:7rem 1fr 2.5rem 4rem; gap:6px; align-items:center; font-size:0.8rem; }
.trust-breakdown-label { font-weight:550; }
.trust-breakdown-bar { height:8px; background:var(--line,#dbe2de); border-radius:4px; overflow:hidden; }
.trust-breakdown-bar span { display:block; height:100%; background:var(--accent,#0d6b57); border-radius:4px; }
.trust-breakdown-pct { text-align:right; font-weight:600; color:var(--muted,#66736d); }
.trust-tier-badge { font-size:0.7rem; font-weight:600; padding:1px 6px; border-radius:20px; display:inline-block; }
.trust-tier-a { background:#d1fae5; color:#065f46; }
.trust-tier-ap { background:#a7f3d0; color:#064e3b; }
.trust-tier-b { background:#fef3c7; color:#92400e; }
.trust-tier-bp { background:#fde68a; color:#92400e; }
.trust-tier-c { background:#fce7f3; color:#9d174d; }
.trust-tier-d { background:#fef2f2; color:#991b1b; }
.trust-section-label { font-size:0.82rem; font-weight:700; text-transform:uppercase; margin:0.75rem 0 0.5rem; }
.trust-section-strength { color:#065f46; }
.trust-section-risk { color:#92400e; }
.trust-factor-card { padding:0 0 0.25rem; margin-bottom:0.35rem; }
.trust-factor-header { display:flex; align-items:center; gap:8px; justify-content:space-between; }
.trust-factor-name { font-size:0.85rem; font-weight:600; }
.trust-factor-score { font-weight:700; font-size:1.05rem; white-space:nowrap; }
.trust-factor-score small { font-size:0.7rem; font-weight:500; }
.trust-factor-note { font-size:0.8rem; color:var(--muted,#66736d); margin:2px 0 0 0; line-height:1.4; }
.trust-methodology-link { margin:1rem 0 0; font-size:0.82rem; }
.trust-methodology-link a { color:var(--accent,#0d6b57); text-decoration:none; cursor:pointer; }
.trust-methodology-link a:hover { text-decoration:underline; }
.trust-opp-sidebar { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:1.5rem 0; }
.trust-opp-sidebar.single { grid-template-columns:1fr; max-width:480px; }
.trust-conf-explanation { font-size:0.82rem; color:var(--muted,#66736d); margin:0 0 0.75rem; padding:0; line-height:1.4; font-style:italic; }
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
}
}
@media (max-width:680px) {
  .trust-factor-bar { grid-template-columns:1fr; gap:2px; }
  .trust-bar-fill { max-width:300px; height:6px; }
  .trust-confidence-card,
  .trust-why-card { padding:0.75rem; }
  .trust-breakdown-row { grid-template-columns:5rem 1fr 2rem; }
  .trust-dot { width:12px; height:12px; }
  .trust-confidence-pct { font-size:1.3rem; }
  .trust-source-item { grid-template-columns:1fr 1fr; gap:4px; }
  .trust-opp-sidebar { grid-template-columns:1fr; }
}`;

  let cssInjected = false;
  function injectCSS() {
    if (cssInjected) return;
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
    cssInjected = true;
  }

  /* ── Build confidence card ── */
  function buildConfidenceHTML(data, lang) {
    var isZh = lang === 'zh';
    var conf = data.overallConfidence || 0;
    var dots = Math.round(conf / 10);
    var factorData = data.factors || [];

    var h = '<div class="trust-confidence-card">';
    h += '<h3 class="trust-card-title"><span class="trust-icon">📊</span> ' + (isZh ? '数据置信度' : 'Data Confidence') + '</h3>';
    h += '<div class="trust-confidence-visual"><span class="trust-dots">';
    for (var i = 0; i < 10; i++) {
      h += '<span class="trust-dot' + (i < dots ? ' trust-dot-filled' : '') + '"></span>';
    }
    h += '</span><span class="trust-confidence-pct">' + conf + '%</span></div>';
    h += '<p class="trust-based-on">' + (isZh ? '基于以下数据：' : 'Based on:') + '</p>';
    h += '<ul class="trust-source-list">';
    if (data.recentSales) h += '<li>' + data.recentSales + (isZh ? ' 个近期成交记录' : ' recent sales') + '</li>';
    if (data.govDatasets) h += '<li>' + data.govDatasets + (isZh ? ' 个政府数据集' : ' government datasets') + '</li>';
    if (data.marketDatasets) h += '<li>' + data.marketDatasets + (isZh ? ' 个市场数据集' : ' market datasets') + '</li>';
    h += '</ul>';

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

    if (factorData.length) {
      h += '<details class="trust-details"><summary class="trust-summary small">' + (isZh ? '因子置信度明细' : 'Per-factor breakdown') + '</summary>';
      h += '<div class="trust-breakdown-grid">';
      for (var fi = 0; fi < factorData.length; fi++) {
        var f = factorData[fi];
        var pct = f.confidence || 0;
        var barW = Math.max(4, Math.round(pct / 10));
        var tierLabel = (!f.tier || f.tier === 'N/A') ? '' : 'Tier ' + f.tier;
        var tierClass = 'trust-tier-' + ((f.tier || 'n').toLowerCase().replace('+','p'));
        if (tierClass === 'trust-tier-n') tierClass = 'trust-tier-b';
        h += '<div class="trust-breakdown-row">';
        h += '<span class="trust-breakdown-label">' + (f.name || '') + '</span>';
        h += '<span class="trust-breakdown-bar"><span style="width:' + barW + 'rem"></span></span>';
        h += '<span class="trust-breakdown-pct">' + pct + '%</span>';
        if (tierLabel) h += '<span class="trust-tier-badge ' + tierClass + '">' + tierLabel + '</span>';
        h += '</div>';
      }
      h += '</div></details>';
    }
    h += '</div>';
    return h;
  }

  /* ── Build "Why Suburb" card ── */
  function buildWhyHTML(data, lang) {
    var isZh = lang === 'zh';
    var factors = data.factors || [];
    var explanations = data.explanations || {};

    var sorted = factors.slice().sort(function(a, b) { return (b.score||0) - (a.score||0); });
    var strengths = sorted.filter(function(f) { return (f.score||0) >= 50; }).slice(0, 3);
    var risks = sorted.filter(function(f) { return (f.score||0) < 50; }).slice(0, 2);
    if (strengths.length === 0 && risks.length === 0) return '';

    var h = '<div class="trust-why-card">';
    h += '<h3 class="trust-card-title"><span class="trust-icon">💡</span> ' + (isZh ? '为什么选择 ' + data.suburb + '？' : 'Why ' + data.suburb + '?') + '</h3>';

    if (strengths.length) {
      h += '<p class="trust-section-label trust-section-strength">' + (isZh ? '优势' : 'Strengths') + '</p>';
      for (var si = 0; si < strengths.length; si++) {
        var f = strengths[si];
        var bc = (f.score||0) >= 70 ? 'trust-tier-a' : 'trust-tier-b';
        var expKey = Object.keys(explanations).find(function(k) { return k.toLowerCase() === ((f.key||'').toLowerCase()); });
        var notes = expKey && explanations[expKey] ? explanations[expKey].slice(0, 2) : [];
        h += '<div class="trust-factor-card">';
        h += '<div class="trust-factor-header"><span class="trust-factor-name">' + f.name + '</span><span class="trust-factor-score ' + bc + '">' + (f.score||0) + ' <small>' + (f.tier||'') + '</small></span></div>';
        for (var ni = 0; ni < notes.length; ni++) {
          h += '<p class="trust-factor-note">' + notes[ni] + '</p>';
        }
        h += '</div>';
      }
    }

    if (risks.length) {
      h += '<p class="trust-section-label trust-section-risk">' + (isZh ? '风险提示' : 'Risks') + '</p>';
      for (var ri = 0; ri < risks.length; ri++) {
        var rf = risks[ri];
        var rbc = 'trust-tier-c';
        var rExpKey = Object.keys(explanations).find(function(k) { return k.toLowerCase() === ((rf.key||'').toLowerCase()); });
        var rNotes = rExpKey && explanations[rExpKey] ? explanations[rExpKey].slice(0, 2) : [];
        h += '<div class="trust-factor-card">';
        h += '<div class="trust-factor-header"><span class="trust-factor-name">' + rf.name + '</span><span class="trust-factor-score ' + rbc + '">' + (rf.score||0) + ' <small>' + (rf.tier||'') + '</small></span></div>';
        for (var rni = 0; rni < rNotes.length; rni++) {
          h += '<p class="trust-factor-note">' + rNotes[rni] + '</p>';
        }
        h += '</div>';
      }
    }

    h += '<p class="trust-methodology-link"><a href="#" class="trust-show-methodology">' + (isZh ? '查看完整评分方法 →' : 'View full methodology →') + '</a></p>';
    h += '</div>';
    return h;
  }


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
      if (!val || val <= 0) return "";
      if (val >= 1000000) return "$" + (val / 1000000).toFixed(2) + "M";
      if (val > 0) return "$" + Number(val).toLocaleString();
      return "";
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


  function render(container, opts) {
    if (!container) return;
    opts = opts || {};
    injectCSS();

    var lang = opts.language || 'en';
    var showMethodology = opts.showMethodology !== false;
    var showConfidence = opts.showConfidence !== false;
    var showWhySuburb = opts.showWhySuburb !== false;

    if (opts.inline && opts.data) {
      renderWithData(container, opts.data, opts);
      return;
    }

    if (!opts.suburb) {
      if (showMethodology) container.innerHTML = METHODOLOGY[lang] || METHODOLOGY.en;
      return;
    }

    container.innerHTML = '<p style="color:var(--muted)">Loading…</p>';

    var url = '/api/suburb-intelligence?suburb=' + encodeURIComponent(opts.suburb);
    fetch(url)
      .then(function(res) { if (!res.ok) throw new Error('Not found'); return res.json(); })
      .then(function(data) { renderWithData(container, data, opts); })
      .catch(function() {
        container.innerHTML = '<p style="color:var(--muted)">' + (lang==='zh' ? '暂无该郊区数据分析' : 'No intelligence data available yet for this suburb') + '</p>';
      });
  }

  function renderWithData(container, data, opts) {
    var lang = (opts && opts.language) || 'en';
    var showMethodology = opts.showMethodology !== false;
    var showConfidence = opts.showConfidence !== false;
    var showWhySuburb = opts.showWhySuburb !== false;
    var sidebar = opts.sidebar !== false;

    var factorKeys = [
      { key: 'value', name: { en: 'Value', zh: '价值' } },
      { key: 'growth', name: { en: 'Growth', zh: '增长' } },
      { key: 'yield', name: { en: 'Yield', zh: '收益' } },
      { key: 'vacancy', name: { en: 'Vacancy', zh: '空置率' } },
      { key: 'school', name: { en: 'School', zh: '学区' } },
      { key: 'income', name: { en: 'Income', zh: '收入' } },
      { key: 'population', name: { en: 'Population', zh: '人口' } },
      { key: 'supply', name: { en: 'Supply', zh: '供应' } },
      { key: 'infrastructure', name: { en: 'Infrastructure', zh: '基础设施' } },
    ];

    var factors = [];
    for (var i = 0; i < factorKeys.length; i++) {
      var fk = factorKeys[i];
      var raw = data[fk.key];
      if (raw && raw.score) {
        var confField = 'conf_' + fk.key;
        factors.push({
          key: fk.key,
          name: fk.name[lang] || fk.name.en,
          score: raw.score,
          tier: raw.tier || 'N/A',
          confidence: data.confidence && data.confidence[fk.key] ? data.confidence[fk.key] : (data[confField] || null),
        });
      }
    }

    var suburb = data.suburb || opts.suburb || '';

    // Count data sets
    var recentSales = data.recentSales || data.recent_sales || null;
    if (!recentSales && data.sourceCounts && data.sourceCounts.sales) recentSales = data.sourceCounts.sales;
    var govDatasets = data.govDatasets || data.gov_datasets || null;
    if (!govDatasets && data.sourceCounts) {
      var gc = 0;
      for (var k in data.sourceCounts) { if (data.sourceCounts[k] === 'govt' || data.sourceCounts[k] === 'government') gc++; }
      if (gc) govDatasets = gc;
    }

    // Calculate from fallback_tier_* for confidence
    var overallConfidence = data.overallConfidence || data.overall_confidence || null;
    if (!overallConfidence && factors.length) {
      var sum = 0, cnt = 0;
      for (var fi = 0; fi < factors.length; fi++) {
        if (factors[fi].confidence) { sum += factors[fi].confidence; cnt++; }
      }
      overallConfidence = cnt ? Math.round(sum / cnt) : 60;
    }

    var confSummary = {
      suburb: suburb,
      overallConfidence: overallConfidence,
      recentSales: recentSales || 0,
      govDatasets: govDatasets || 0,
      marketDatasets: data.sourceCounts && data.sourceCounts.market ? data.sourceCounts.market : 0,
      factors: factors,
      explanations: data.explanations || {},
    };

    var html = '';
    if (showMethodology) html += METHODOLOGY[lang] || METHODOLOGY.en;

    if (showConfidence || showWhySuburb) {
      var hasConf = showConfidence && confSummary.overallConfidence;
      var hasWhy = showWhySuburb && factors.length > 1;
      if (hasConf || hasWhy) {
        var sideClass = 'trust-opp-sidebar';
        if (!hasConf || !hasWhy) sideClass += ' single';
        html += '<div class="' + sideClass + '">';
        if (hasConf) html += buildConfidenceHTML(confSummary, lang);
        if (hasWhy) html += buildWhyHTML(confSummary, lang);
        html += buildSuitabilityHTML(data, lang);
        html += '</div>';
      }
    }

    container.innerHTML = html;

    // Wire methodology toggles
    var links = container.querySelectorAll('.trust-show-methodology');
    for (var li = 0; li < links.length; li++) {
      (function(link) {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          var method = container.querySelector('.trust-methodology .trust-details');
          if (method) method.open = !method.open;
        });
      })(links[li]);
    }
  }

  function getMethodologyHTML(lang) {
    return METHODOLOGY[lang] || METHODOLOGY.en;
  }

  /* ── Export ── */
  global.TrustLayer = {
    render: render,
    getMethodologyHTML: getMethodologyHTML,
  };

})(typeof window !== "undefined" ? window : this);
