/**
 * uv-service.js — Undervaluation scoring service (ESM)
 *
 * Loads the V4 UV model (OLS coefficients per segment) and computes
 * theory price, ratio, and UV score for any given suburb.
 *
 * Usage:
 *   import { loadModel, getCachedScore, getOpportunities } from './lib/uv-service.js';
 *   loadModel();
 *   const result = getCachedScore('brighton');
 *   const list = getOpportunities({ minUv: 60, limit: 10 });
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let model = null;
let suburbIndex = null;
let dbScores = null;

const MODEL_PATH = join(__dirname, '..', 'data', 'uv-model-v4.json');

/**
 * Load model config + DB UV scores. Call once on startup.
 */
export function loadModel(filePath) {
  const fp = filePath || MODEL_PATH;
  if (!existsSync(fp)) {
    console.error('[uv-service] Model file not found: ' + fp);
    return false;
  }
  model = JSON.parse(readFileSync(fp, 'utf8'));
  buildSuburbIndex();
  // Kick off async DB load (don't block cold start)
  loadDbScores().then(() => {
    console.log('[uv-service] Loaded ' + Object.keys(dbScores || {}).length + ' DB UV scores');
  }).catch(e => {
    console.warn('[uv-service] DB UV scores unavailable, using model-only: ' + e.message);
  });
  console.log('[uv-service] Loaded ' + Object.keys(model.segments).length + ' segments');
  return true;
}

async function loadDbScores() {
  const envRaw = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  const mm = envRaw.match(/DATABASE_URL='([^']+)'/);
  if (!mm) throw new Error('DATABASE_URL not found in .env');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(mm[1], { fetchOptions: { timeout: 5000 } });
  const rows = await sql.query(
    "SELECT LOWER(suburb) sub, uv_score_v4 uv, uv_score_v4_label label FROM suburb_metrics WHERE uv_score_v4 IS NOT NULL"
  );
  dbScores = {};
  rows.forEach(r => {
    dbScores[r.sub] = { uv: Number(r.uv), label: r.label };
  });
}

function buildSuburbIndex() {
  suburbIndex = {};
  Object.entries(model.segments).forEach(([segName, seg]) => {
    seg.members.forEach(s => {
      suburbIndex[s.toLowerCase()] = {
        segment: segName,
        vars: seg.vars,
        beta: seg.beta,
        intercept: seg.intercept,
        cashBeta: seg.cashBeta
      };
    });
  });
}

/**
 * Score a single suburb given its factor values.
 * @param {string} suburbName - e.g. "brighton"
 * @param {object} factors - e.g. { logIncome: 12.3, logUnemp: 1.2, ... }
 * @param {number} actualPrice - actual median price for ratio calc
 * @returns {object|null}
 */
export function scoreSuburb(suburbName, factors, actualPrice) {
  if (!model || !suburbIndex) return null;

  const key = suburbName.toLowerCase();
  const entry = suburbIndex[key];
  if (!entry) return null;

  const x = [1];
  let missingFactor = false;
  entry.vars.forEach(f => {
    if (factors[f] == null) missingFactor = true;
    x.push(factors[f] != null ? factors[f] : 0);
  });
  x.push(model.cashRate);

  if (missingFactor) {
    console.warn(`[uv-service] Missing factors for ${suburbName}, using 0 as fallback`);
  }

  const betas = [entry.intercept];
  entry.vars.forEach(f => betas.push(entry.beta[f]));
  betas.push(entry.cashBeta);

  const predLog = x.reduce((sum, xi, j) => sum + xi * (betas[j] || 0), 0);
  const theoryPrice = Math.exp(predLog);
  const ratio = actualPrice && actualPrice > 0 ? actualPrice / theoryPrice : null;

  let uv = 50, label = 'N/A';
  if (ratio != null) {
    const pir = 15;
    const priceScore = ratio < 1
      ? Math.min(100, 50 + (1 - ratio) * 100)
      : Math.max(0, 50 - (ratio - 1) * 100);
    const pirScore = Math.max(0, Math.min(100, (15 - pir) / 10 * 100));
    uv = Math.round(0.6 * priceScore + 0.4 * pirScore);
    label = uv >= 80 ? '明显偏低🟢' :
            uv >= 60 ? '略微偏低🟢' :
            uv >= 40 ? '接近合理🟡' :
            uv >= 20 ? '略微偏高🟠' :
                       '明显偏高🔴';
  }

  return {
    segment: entry.segment,
    actualPrice: actualPrice ? Math.round(actualPrice) : null,
    theoryPrice: Math.round(theoryPrice),
    ratio: ratio != null ? +ratio.toFixed(3) : null,
    uv,
    label
  };
}

/**
 * Get UV score from DB (or fallback to model cache).
 */
export function getCachedScore(suburbName) {
  if (!model) return null;
  const key = suburbName.toLowerCase();
  // Prefer DB scores (live, authoritative)
  if (dbScores && dbScores[key]) {
    const s = dbScores[key];
    return { uv: s.uv, label: s.label, segment: (suburbIndex[key] || {}).segment || null };
  }
  // Fallback to model-internal cache
  return model.uvScores[key] || null;
}

/**
 * Get investment opportunities sorted by UV score ascending (most undervalued first).
 */
export function getOpportunities(opts = {}) {
  if (!model) return [];
  const minUv = opts.minUv || 60;
  const limit = opts.limit || 20;

  // Use DB scores when available, else fallback to model.uvScores
  const source = dbScores || model.uvScores || {};

  const scored = Object.entries(source)
    .map(([suburb, score]) => {
      const segInfo = (suburbIndex[suburb] || {});
      return {
        suburb,
        uv: typeof score === 'object' ? score.uv : score,
        label: score.label || 'N/A',
        segment: score.segment || segInfo.segment || null
      };
    })
    .filter(s => s.uv >= minUv)
    .sort((a, b) => b.uv - a.uv)
    .slice(0, limit);

  if (opts.segment) {
    return scored.filter(s => s.segment === opts.segment);
  }
  return scored;
}
