/**
 * growth-projector.js — 增长推算引擎
 *
 * 三层次架构:
 *   第1层: 基准趋势率 (Base Rate) — 从 comparable_sales 月频数据计算
 *   第2层: 位置弹性系数 (Location Elasticity) — 从 suburb 静态特征计算
 *   第3层: 宏观周期修正 (Macro Adjustment) — 从 RBA 利率曲线计算
 *
 * 策略:
 *   A — 高频区: suburb 自身周粒度 OLS 回归
 *   B — 中频区: 同价格段 pooled 回归
 *   C — 低频区: 全市场 median 趋势
 */

import { neon } from '@neondatabase/serverless';
let _sql;
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  return _sql;
}

// ──────── 第1层: 基准趋势率 ────────

async function computeBaseRate(suburb) {
  const db = sql();
  const rows = await db`
    WITH weekly AS (
      SELECT date_trunc('week', sale_date)::date AS wk, COUNT(*)::int AS cnt,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS med_price
      FROM comparable_sales
      WHERE LOWER(suburb) = ${suburb.toLowerCase()} AND sale_price > 50000 AND sale_price < 50000000
        AND sale_date > NOW() - INTERVAL '136 days'
      GROUP BY date_trunc('week', sale_date)::date
      HAVING COUNT(*) >= 2
    ) SELECT * FROM weekly ORDER BY wk
  `;

  // Minimum 4 data points AND at least 3 sales/week on average for reliable OLS
  // Require at least 6 data points with decent volume for reliable OLS
  const minWeeklyForA = 6;
  const minAvgSalesForA = 3;
  const totalSales = rows.reduce((s,r) => s+r.cnt, 0);
  const avgWeeklySales = rows.length > 0 ? totalSales / rows.length : 0;
  
  if (rows.length >= minWeeklyForA && avgWeeklySales >= minAvgSalesForA) {
    const maxWeekly = Math.max(...rows.map(r => r.cnt));
    if (maxWeekly >= 3) {
      const conf = rows.length >= 8 ? 'high' : 'medium';
      // For medium confidence, use tighter bounds to avoid extreme clamps
      const [minCap, maxCap] = conf === 'high' ? [-15, 30] : [-3, 10];
      const result = olsFromPoints(rows.map(r => Math.log(Number(r.med_price))), 'A', conf, rows.length, totalSales, minCap, maxCap);
      // If OLS hit the clamp boundary despite having ~weekly data, likely spurious — fall back to VGV
      const vgv = await fallbackVGV(suburb);
      if (vgv && (result.baseAnnualRate <= minCap + 1 || result.baseAnnualRate >= maxCap - 1)) return vgv;
      return result;
    }
  }

  // D) VGV official CAGR — preferred over noisy OLS with small samples
  const vgv = await fallbackVGV(suburb);
  if (vgv) return vgv;
  // B) Pooled regression (same price bracket)
  const pool = await computePooledRate(suburb);
  if (pool) return pool;
  // C) Market average trend
  return fallbackC();
}

function olsFromPoints(yVals, method, confidence, weeks, totalSales, minCap, maxCap) {
  const n = yVals.length;
  if (n < 2) return { baseAnnualRate: 4.0, method, confidence: 'low', weeks, totalSales };
  const xMean = (n - 1) / 2;
  const yMean = yVals.reduce((s, v) => s + v, 0) / n;
  let num = 0, denom = 0;
  for (let i = 0; i < n; i++) { const x = i - xMean; num += x * (yVals[i] - yMean); denom += x * x; }
  const beta = denom > 0 ? num / denom : 0;
  const annualized = (Math.exp(beta * 52) - 1) * 100;
  return { baseAnnualRate: clamp(annualized, minCap, maxCap), method, confidence, weeks, totalSales };
}

async function computePooledRate(suburb) {
  const db = sql();
  const meta = await db`SELECT median_house_price FROM suburb_metrics WHERE LOWER(suburb) = ${suburb.toLowerCase()}`;
  const hp = Number(meta[0]?.median_house_price) || 0;
  let hpMin = 0, hpMax = 999999999;
  if (hp < 600000) { hpMin = 0; hpMax = 600000; }
  else if (hp < 800000) { hpMin = 600000; hpMax = 800000; }
  else if (hp < 1200000) { hpMin = 800000; hpMax = 1200000; }
  else { hpMin = 1200000; hpMax = 999999999; }

  const poolRows = await db`
    WITH weekly AS (
      SELECT date_trunc('week', cs.sale_date)::date AS wk,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cs.sale_price) AS med_price
      FROM comparable_sales cs JOIN suburb_metrics sm ON LOWER(cs.suburb) = LOWER(sm.suburb)
      WHERE sm.median_house_price IS NOT NULL
        AND sm.median_house_price >= ${hpMin}::numeric
        AND sm.median_house_price < ${hpMax}::numeric
        AND cs.sale_price > 50000 AND cs.sale_price < 50000000
        AND cs.sale_date > NOW() - INTERVAL '136 days' AND LOWER(cs.suburb) != ${suburb.toLowerCase()}
      GROUP BY date_trunc('week', cs.sale_date)::date
      HAVING COUNT(*) >= 3
    ) SELECT wk, med_price FROM weekly ORDER BY wk
  `;

  if (poolRows.length >= 3) return olsFromPoints(poolRows.map(r => Math.log(Number(r.med_price))), 'B', 'medium', poolRows.length, 0, -8, 15);
  if (poolRows.length === 2) return { baseAnnualRate: 3.0, method: 'B', confidence: 'low', weeks: 2, totalSales: 0 };
  if (poolRows.length === 1) return { baseAnnualRate: 4.0, method: 'B', confidence: 'low', weeks: 1, totalSales: 0 };
  return null;
}

async function fallbackC() {
  const db = sql();
  const rows = await db`
    WITH weekly AS (
      SELECT date_trunc('week', sale_date)::date AS wk,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS med_price
      FROM comparable_sales WHERE sale_price > 50000 AND sale_price < 50000000
        AND sale_date > NOW() - INTERVAL '136 days'
      GROUP BY date_trunc('week', sale_date)::date HAVING COUNT(*) >= 5
    ) SELECT wk, med_price FROM weekly
  `;
  if (rows.length < 2) return { baseAnnualRate: 5.0, method: 'C', confidence: 'low', weeks: 0, totalSales: 0 };
  return olsFromPoints(rows.map(r => Math.log(Number(r.med_price))), 'C', 'low', rows.length, 0, -5, 15);
}

// ──────── Fallback D: VGV 官方 CAGR ────────

async function fallbackVGV(suburb) {
  const db = sql();
  const row = await db`SELECT govt_5yr_cagr FROM suburb_metrics WHERE LOWER(suburb) = ${suburb.toLowerCase()} AND govt_5yr_cagr IS NOT NULL`;
  if (row.length === 0) return null;
  const cagr = Number(row[0].govt_5yr_cagr);
  // Clamp: VGV data is annual (longer horizon), so use wider bounds
  const capped = clamp(cagr, -3, 12);
  return { baseAnnualRate: capped, method: 'D', confidence: 'medium', weeks: 260, totalSales: 0 };
}

// ──────── 第2层: 位置弹性系数 ────────

function computeLocationElasticity(meta) {
  if (!meta) return 1.0;
  let el = 1.0;
  const hp = Number(meta.median_house_price) || 0;
  if (hp < 400000) el += 0.12;
  else if (hp < 600000) el += 0.08;
  else if (hp < 800000) el += 0.04;
  else if (hp > 1500000) el -= 0.10;
  else if (hp > 1000000) el -= 0.05;
  const sch = Number(meta.school_score) || 0;
  if (sch >= 80) el += 0.10;
  else if (sch >= 65) el += 0.05;
  else if (sch >= 50) el += 0.02;
  const yld = Number(meta.gross_yield) || 0;
  if (yld >= 3.0) el += 0.03;
  else if (yld <= 0.8) el -= 0.02;
  el = clamp(el, 0.80, 1.20);
  if (hp < 400000 && yld > 0) el = Math.min(el, 1.15);
  if (hp > 1500000) el = Math.max(el, 0.85);
  return el;
}

// ──────── 第3层: 宏观周期修正 ────────

async function computeMacroAdjustment() {
  const db = sql();
  const rates = await db`
    SELECT value, recorded_date FROM macro_indicators
    WHERE indicator = 'cash_rate'
    ORDER BY recorded_date DESC LIMIT 24
  `;
  if (rates.length < 3) return { adj3y: 0.95, adj5y: 0.90, confidence: 'low' };

  const vals = rates.map(r => Number(r.value));
  const current = vals[0];
  const prevYear = vals.length >= 12 ? vals[11] : vals[vals.length - 1];
  const trend12m = current - prevYear;

  let adj3y = 1.0, conf = 'medium';
  if (trend12m > 0.5) { adj3y = 0.87; conf = 'medium'; }
  else if (trend12m > 0.1) { adj3y = 0.93; conf = 'medium'; }
  else if (trend12m < -0.5) { adj3y = 1.15; conf = 'medium'; }
  else if (trend12m < -0.1) { adj3y = 1.08; conf = 'medium'; }
  else if (current >= 4.0) { adj3y = 0.92; }
  else if (current >= 2.5) { adj3y = 0.96; }
  else { adj3y = 1.02; }

  return { adj3y, adj5y: adj3y * 0.92, confidence: conf };
}

// ──────── 集成引擎 ────────

export async function projectGrowth(suburb) {
  const db = sql();
  const [baseRate, meta, macroAdj] = await Promise.all([
    computeBaseRate(suburb),
    db`SELECT * FROM suburb_metrics WHERE LOWER(suburb) = ${suburb.toLowerCase()}`.then(r => r[0] || null),
    computeMacroAdjustment()
  ]);

  const elasticity = computeLocationElasticity(meta);
  const rawAnnualRate = baseRate.baseAnnualRate * elasticity;

  let adj3y, adj5y;
  if (baseRate.confidence === 'high') {
    adj3y = rawAnnualRate * macroAdj.adj3y;
    adj5y = rawAnnualRate * macroAdj.adj5y;
  } else if (baseRate.confidence === 'medium') {
    adj3y = rawAnnualRate * macroAdj.adj3y * 0.95;
    adj5y = rawAnnualRate * macroAdj.adj5y * 0.95;
  } else {
    adj3y = rawAnnualRate * macroAdj.adj3y * 1.15;
    adj5y = rawAnnualRate * macroAdj.adj5y * 1.10;
  }

  const confidence = (
    baseRate.confidence === 'low' || macroAdj.confidence === 'low' ? 'low' :
    baseRate.confidence === 'medium' || macroAdj.confidence === 'medium' ? 'medium' : 'high'
  );

  return {
    growth3y: clamp(adj3y, -8, 25),
    growth5y: clamp(adj5y, -5, 20),
    baseRate: Math.round(baseRate.baseAnnualRate * 100) / 100,
    elasticity: Math.round(elasticity * 1000) / 1000,
    macroAdj3y: macroAdj.adj3y,
    macroAdj5y: macroAdj.adj5y,
    confidence,
    method: baseRate.method,
    detail: `base=${baseRate.baseAnnualRate.toFixed(2)}% (${baseRate.method}), el=${elasticity.toFixed(3)}, macro=${macroAdj.adj3y.toFixed(3)}/${macroAdj.adj5y.toFixed(3)}`
  };
}

async function batchProjectAll() {
  const db = sql();
  // Include all suburb_metrics suburbs, not just those with sales data
  // The growth engine will fall back to VGV for suburbs without recent sales
  const suburbs = await db`SELECT suburb FROM suburb_metrics ORDER BY suburb`;
  console.log(`[growth-projector] Projecting ${suburbs.length} suburbs...`);
  const t0 = Date.now();
  let done = 0;

  for (const row of suburbs) {
    try {
      const result = await projectGrowth(row.suburb);
      // For method D (VGV), growth_1y is not meaningful — the VGV CAGR is multi-year
      const g1y = result.method === 'D' ? null : (result.baseRate > 0 ? result.baseRate : 0);
      await db`
        UPDATE suburb_metrics SET growth_1y = CASE WHEN ${g1y}::numeric IS NOT NULL THEN ${g1y}::numeric ELSE growth_1y END,
          growth_3y = ${Math.round(result.growth3y * 100) / 100}::numeric,
          growth_5y = ${Math.round(result.growth5y * 100) / 100}::numeric,
          updated_at = NOW()
        WHERE LOWER(suburb) = ${row.suburb.toLowerCase()}
      `;
      done++;
    } catch(e) { console.warn(`[growth-projector] Fail: ${row.suburb} - ${e.message}`); }
  }
  console.log(`[growth-projector] ✓ ${done}/${suburbs.length} suburbs in ${((Date.now()-t0)/1000).toFixed(1)}s`);
}

function clamp(v, min, max) { return Math.round(Math.max(min, Math.min(max, v)) * 100) / 100; }

// CLI
if (process.argv[1] && process.argv[1].includes('growth-projector')) {
  const sub = process.argv[2];
  if (sub) {
    projectGrowth(sub).then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
  } else {
    batchProjectAll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  }
}

export { batchProjectAll };
