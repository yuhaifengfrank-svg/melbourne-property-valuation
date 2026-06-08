// ── 学校数据查询服务 ──
// 用于估值模型中注入教育因子

import { getSql } from "../api/_db.js";

// 缓存不同 suburb 的 ICSEA 数据，减少 DB 查询
const _cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export function clearSchoolCache() {
  _cache.clear();
}

/**
 * 获取某区的学校评分概要
 * @param {string} suburb
 * @param {string} [state='VIC']
 * @returns {Promise<{schoolCount: number, avgIcsea: number|null, bestIcsea: number|null, primaryCount: number, secondaryCount: number}|null>}
 */
export async function getSuburbSchoolProfile(suburb, state = 'VIC') {
  if (!suburb || typeof suburb !== 'string') return null;
  const key = `${suburb}|${state}`.toLowerCase();

  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  try {
    const sql = getSql();

    // 查该区的学校数量 + ICSEA 汇总
    const [row] = await sql`
      SELECT
        COUNT(*)::int AS school_count,
        ROUND(AVG(p.icsea)::numeric, 1) AS avg_icsea,
        MAX(p.icsea) AS best_icsea,
        COUNT(*) FILTER (WHERE l.school_type IN ('Primary', 'Primary School'))::int AS primary_count,
        COUNT(*) FILTER (WHERE l.school_type IN ('Secondary', 'Secondary School', 'Combined', 'Combined School'))::int AS secondary_count
      FROM school_locations l
      LEFT JOIN school_profiles p ON l.acara_sml_id = p.acara_sml_id
      WHERE LOWER(l.suburb) = LOWER(${suburb})
        AND l.state = ${state}
    `;

    if (!row || !row.school_count || row.school_count === 0) {
      _cache.set(key, { data: null, ts: Date.now() });
      return null;
    }

    const result = {
      schoolCount: row.school_count,
      avgIcsea: row.avg_icsea ? Number(row.avg_icsea) : null,
      bestIcsea: row.best_icsea ? Number(row.best_icsea) : null,
      primaryCount: row.primary_count,
      secondaryCount: row.secondary_count,
      suburb,
      state
    };

    _cache.set(key, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.error(`[school-service] Error for ${suburb}: ${err.message}`);
    return null;
  }
}
