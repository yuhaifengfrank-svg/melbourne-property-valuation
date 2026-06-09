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
  const rows = await db.query(`
    WITH weekly AS (
      SELECT date_trunc('week', sale_date)::date AS wk, COUNT(*)::int AS cnt,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS med_price
      FROM comparable_sales
      WHERE suburb = $1 AND sale_price > 50000 AND sale_price < 50000000
        AND sale_date > NOW() - INTERVAL '136 days'
      GROUP BY date_trunc('week', sale_date)::date
      HAVING COUNT(*) >= 2
    ) SELECT * FROM weekly ORDER BY wk
  `, [suburb]);

  if (rows.length < 2) {
    const pool = await computePooledRate(suburb);
    if (pool) return pool;
    return fallbackC();
  }

  const maxWeekly = Math.max(...rows.map(r => r.cnt));
  if (maxWeekly >= 3 && rows.length >= 2) {
    return olsFromPoints(rows.map(r => Math.log(Number(r.med_price))), 'A', rows.length >= 5 ? 'high' : 'medium', rows.length, rows.reduce((s,r) => s+r.cnt,0), -15, 30);
  }

  const pool = await computePooledRate(suburb);
  if (pool) return pool;
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
  const meta = await db.query('SELECT median_house_price FROM suburb_metrics WHERE suburb = $1', [suburb]);
  const hp = Number(meta[0]?.median_house_price) || 0;
  let pw;
  if (hp < 600000) pw = 'sm.median_house_price >= 0 AND sm.median_house_price < 600000';
  else if (hp < 800000) pw = 'sm.median_house_price >= 600000 AND sm.median_house_price < 800000';
  else if (hp < 1200000) pw = 'sm.median_house_price >= 800000 AND sm.median_house_price < 1200000';
  else pw = 'sm.median_house_price >= 1200000';

  const poolRows = await db.query(`
    WITH weekly AS (
      SELECT date_trunc('week', cs.sale_date)::date AS wk,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cs.sale_price) AS med_price
      FROM comparable_sales cs JOIN suburb_metrics sm ON cs.suburb = sm.suburb
      WHERE sm.median_house_price IS NOT NULL AND ${pw}
        AND cs.sale_price > 50000 AND cs.sale_price < 50000000
        AND cs.sale_date > NOW() - INTERVAL '136 days' AND cs.suburb != $1
      GROUP BY date_trunc('week', cs.sale_date)::date
      HAVING COUNT(*) >= 3
    ) SELECT wk, med_price FROM weekly ORDER BY wk
  `, [suburb]);

  if (poolRows.length >= 3) return olsFromPoints(poolRows.map(r => Math.log(Number(r.med_price))), 'B', 'medium', poolRows.length, 0, -8, 15);
  if (poolRows.length === 2) return { baseAnnualRate: 3.0, method: 'B', confidence: 'low', weeks: 2, totalSales: 0 };
  if (poolRows.length === 1) return { baseAnnualRate: 4.0, method: 'B', confidence: 'low', weeks: 1, totalSales: 0 };
  return null;
}

async function fallbackC() {
  const db = sql();
  const rows = await db.query(`
    WITH weekly AS (
      SELECT date_trunc('week', sale_date)::date AS wk,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS med_price
      FROM comparable_sales WHERE sale_price > 50000 AND sale_price < 50000000
        AND sale_date > NOW() - INTERVAL '136 days'
      GROUP BY date_trunc('week', sale_date)::date HAVING COUNT(*) >= 5
    ) SELECT wk, med_price FROM weekly
  `);
  if (rows.length < 2) return { baseAnnualRate: 5.0, method: 'C', confidence: 'low', weeks: 0, totalSales: 0 };
  return olsFromPoints(rows.map(r => Math.log(Number(r.med_price))), 'C', 'low', rows.length, 0, -5, 15);
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
  const rates = await db.query(`
    SELECT value, recorded_date FROM macro_indicators
    WHERE indicator = 'cash_rate'
    ORDER BY recorded_date DESC LIMIT 24
  `);
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
    db.query('SELECT * FROM suburb_metrics WHERE suburb = $1', [suburb]).then(r => r[0] || null),
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
  const suburbs = await db.query("SELECT suburb FROM comparable_sales WHERE sale_price > 50000 GROUP BY suburb ORDER BY suburb");
  console.log(`[growth-projector] Projecting ${suburbs.length} suburbs...`);
  const t0 = Date.now();
  let done = 0;

  for (const row of suburbs) {
    try {
      const result = await projectGrowth(row.suburb);
      await db.query(
        `UPDATE suburb_metrics SET growth_1y = CASE WHEN $1::numeric IS NOT NULL THEN $1::numeric ELSE growth_1y END, growth_3y = $2::numeric, growth_5y = $3::numeric, updated_at = NOW() WHERE suburb = $4::text`,
        [result.baseRate > 0 ? result.baseRate : 0, Math.round(result.growth3y * 100) / 100, Math.round(result.growth5y * 100) / 100, row.suburb]
      );
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
