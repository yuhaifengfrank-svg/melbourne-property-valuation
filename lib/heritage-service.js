/**
 * heritage-service.js
 *
 * Heritage status check for a property address.
 * Combines two sources:
 *   1. VicPlan Heritage Overlay (HO) — via planning_cache or vicplan_overlays ST_Contains
 *   2. Victorian Heritage Register (VHR) — via vhr_zones ST_Contains
 *
 * Returns structured heritage flag + discount signal.
 */

/**
 * Check if a property is under heritage designation.
 *
 * @param {object} sql - Neon SQL client (pg tagged-template or raw pool)
 * @param {number} lat
 * @param {number} lng
 * @param {object} [planningSignals] - Existing planning signal (optional, for HO check)
 * @returns {Promise<{flagged: boolean, sources: string[], details: object[]}>
 */
export async function checkHeritage(sql, lat, lng, planningSignals) {
  const sources = [];
  const details = [];

  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    return { flagged: false, sources: [], details: [], note: "Coordinates not available." };
  }

  // ── Source 1: VicPlan Heritage Overlay (from existing planning signals) ──
  if (planningSignals?.ok && planningSignals.overlays?.length > 0) {
    const hoOverlays = planningSignals.overlays.filter(o => {
      const code = o.code || '';
      return code.startsWith('HO');
    });
    if (hoOverlays.length > 0) {
      sources.push('HO');
      details.push(...hoOverlays.map(o => ({
        source: 'HO',
        code: o.code,
        name: o.name,
        risk: 'high',
      })));
    }
  }

  // ── Source 2: Victorian Heritage Register ──
  try {
    if (sql?.query) {
      const vhrRows = await sql.query(
        `SELECT vhr_num, site_name FROM vhr_zones
         WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
         LIMIT 10`,
        [lng, lat]
      );

      if (vhrRows.rows?.length > 0) {
        sources.push('VHR');
        for (const row of vhrRows.rows) {
          details.push({
            source: 'VHR',
            code: row.vhr_num,
            name: row.site_name,
            risk: 'high',
          });
        }
      }
    }
  } catch (err) {
    console.warn('[heritage-service] VHR query error:', err.message);
  }

  const flagged = sources.length > 0;
  return {
    flagged,
    sources: [...new Set(sources)], // deduplicate
    details,
    discount: flagged ? -0.20 : 0,
    note: flagged
      ? `This property is subject to heritage designation (${sources.join(' + ')}). Valuation adjusted down by 20%.`
      : null,
  };
}

export default { checkHeritage };
