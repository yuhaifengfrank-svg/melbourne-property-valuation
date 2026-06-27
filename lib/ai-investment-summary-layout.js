/** ─────────────────────────────────────────────────────────────────────
 *  Insert AI Investment Summary block into suburb page HTML
 *  Place this below <div class="disclaimer"> and above <h2>Growth Drivers</h2>
 *  ─────────────────────────────────────────────────────────────────────
 *  Call insertAiInvestmentSummary(data) within suburbPageHTML() to get
 *  the HTML block string. Insert it right after the disclaimer paragraph
 *  closing tag.
 *  ───────────────────────────────────────────────────────────────────── */

// ─── Helper ──────────────────────────────────────────────────────────────
function scoreLabel(val, high=70, low=40) {
  if (val == null) return { label: '—', barPct: 0 };
  const barPct = Math.min(100, Math.max(0, val));
  let label;
  if (val >= high) label = 'Strong';
  else if (val >= low) label = 'Moderate';
  else label = 'Weak';
  return { label, barPct };
}

function safe(arr) { return Array.isArray(arr) && arr.length > 0 ? arr : null; }

// ─── Main block generator ──────────────────────────────────────────────
export function insertAiInvestmentSummary(data) {
  // data.aiSummary is the parsed ai_summary_json from DB
  const a = data.aiSummary;
  if (!a || (!a.risk_score && !a.conviction_score && !a.final_verdict)) {
    return ''; // nothing to show
  }

  const oppLabel = scoreLabel(a.opportunity_score);
  const riskL = scoreLabel(a.risk_score);
  // For risk, invert: lower risk = stronger
  let riskLabel;
  if (a.risk_score == null) riskLabel = '—';
  else if (a.risk_score >= 65) riskLabel = 'High';
  else if (a.risk_score >= 35) riskLabel = 'Moderate';
  else riskLabel = 'Low';
  const convL = scoreLabel(a.conviction_score);

  // Verdict colour
  const vColour = {
    'Strong Buy': '#0d6b57',
    'Buy': '#1a8a72',
    'Opportunistic Buy': '#b8860b',
    'Hold': '#66736d',
    'Watchlist': '#c97a2b',
    'Avoid': '#b33d3d',
  }[a.final_verdict] || '#66736d';

  const bestFor = safe(a.best_for);
  const notIdeal = safe(a.not_ideal_for);
  const drivers = safe(a.key_drivers);
  const risks = safe(a.key_risks);

  return `
    <style>
      .ai-summary { background: white; border: 1px solid #dbe2de; border-radius: 12px; padding: 24px; margin-bottom: 32px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
      .ai-summary-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
      .ai-summary-header h2 { font-size: 1rem; font-weight: 600; color: #17211d; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
      .ai-summary-header .badge { font-size: 0.7rem; background: #0d6b57; color: white; padding: 2px 10px; border-radius: 20px; font-weight: 500; }
      .ai-verdict-banner { background: ${vColour}; color: white; border-radius: 8px; padding: 14px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
      .ai-verdict-banner .label { font-size: 0.75rem; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.5px; }
      .ai-verdict-banner .value { font-size: 1.3rem; font-weight: 700; }
      .ai-scores { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
      .ai-score-card { background: #f4f6f5; border-radius: 8px; padding: 14px; }
      .ai-score-card .label { font-size: 0.72rem; color: #66736d; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; }
      .ai-score-card .score-row { display: flex; align-items: baseline; gap: 6px; }
      .ai-score-card .score-val { font-size: 1.5rem; font-weight: 700; color: #17211d; }
      .ai-score-card .score-sub { font-size: 0.78rem; color: #66736d; }
      .ai-score-bar { height: 4px; background: #dbe2de; border-radius: 4px; margin-top: 8px; overflow: hidden; }
      .ai-score-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
      .ai-score-bar-fill.opp { background: #0d6b57; }
      .ai-score-bar-fill.risk { background: #b33d3d; }
      .ai-score-bar-fill.conv { background: #1a8a72; }
      .ai-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
      .ai-tag { font-size: 0.75rem; padding: 4px 12px; border-radius: 20px; font-weight: 500; }
      .ai-tag.pos { background: #e3f0ed; color: #0d6b57; }
      .ai-tag.neg { background: #f5e8e8; color: #b33d3d; }
      .ai-tag.neutral { background: #f0f0f0; color: #66736d; }
      .ai-factors { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 4px; }
      .ai-factor-group h4 { font-size: 0.72rem; color: #66736d; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px; }
      .ai-factor-item { font-size: 0.82rem; color: #17211d; padding: 3px 0; display: flex; justify-content: space-between; }
      .ai-factor-item .val { color: #66736d; }
      @media (max-width: 640px) { .ai-scores { grid-template-columns: 1fr; } .ai-factors { grid-template-columns: 1fr; } }
    </style>

    <div class="ai-summary">
      <div class="ai-summary-header">
        <h2>AI Investment Summary</h2>
        <span class="badge">Powered by data</span>
      </div>

      <div class="ai-verdict-banner">
        <div>
          <div class="label">Final Verdict</div>
          <div class="value">${a.final_verdict || '—'}</div>
        </div>
      </div>

      <div class="ai-scores">
        <div class="ai-score-card">
          <div class="label">Opportunity</div>
          <div class="score-row">
            <span class="score-val">${a.opportunity_score ?? '—'}</span>
            <span class="score-sub">/100 · ${oppLabel.label}</span>
          </div>
          <div class="ai-score-bar"><div class="ai-score-bar-fill opp" style="width:${oppLabel.barPct}%"></div></div>
        </div>
        <div class="ai-score-card">
          <div class="label">Risk</div>
          <div class="score-row">
            <span class="score-val">${a.risk_score ?? '—'}</span>
            <span class="score-sub">/100 · ${riskLabel}</span>
          </div>
          <div class="ai-score-bar"><div class="ai-score-bar-fill risk" style="width:${riskLabel.barPct}%"></div></div>
        </div>
        <div class="ai-score-card">
          <div class="label">Conviction</div>
          <div class="score-row">
            <span class="score-val">${a.conviction_score ?? '—'}</span>
            <span class="score-sub">/100 · ${convL.label}</span>
          </div>
          <div class="ai-score-bar"><div class="ai-score-bar-fill conv" style="width:${convL.barPct}%"></div></div>
        </div>
      </div>

      ${bestFor ? `<div class="ai-tags">${bestFor.map(t => `<span class="ai-tag pos">✓ ${t}</span>`).join('')}</div>` : ''}
      ${notIdeal ? `<div class="ai-tags">${notIdeal.map(t => `<span class="ai-tag neg">✗ Not ideal: ${t}</span>`).join('')}</div>` : ''}

      <div class="ai-factors">
        <div class="ai-factor-group">
          <h4>Key Positive Drivers</h4>
          ${drivers ? drivers.map(d => `<div class="ai-factor-item"><span>${d.factor}</span><span class="val">${d.value}</span></div>`).join('') : '<div class="ai-factor-item" style="color:#66736d">Data not available</div>'}
        </div>
        <div class="ai-factor-group">
          <h4>Key Risks</h4>
          ${risks ? risks.map(r => `<div class="ai-factor-item"><span>${r.factor}</span><span class="val">${r.value}</span></div>`).join('') : '<div class="ai-factor-item" style="color:#66736d">Data not available</div>'}
        </div>
      </div>
    </div>
  `;
}
