/**
 * heritage-service.js
 *
 * Heritage status check for a property address.
 * Combines two sources:
 *   1. VicPlan Heritage Overlay (HO) — exact-point lookup in vicplan_overlays
 *   2. Victorian Heritage Register (VHR) — exact-point lookup in vhr_zones
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

  // ── Source 1a: VicPlan Heritage Overlay (from existing planning signals) ──
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

  // ── Source 1b: exact property-level Heritage Overlay lookup ──
  try {
    const hoRows = await queryRows(
      sql,
      `SELECT zone_code, zone_description FROM vicplan_overlays
       WHERE zone_code LIKE 'HO%'
         AND ST_Covers(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
       LIMIT 10`,
      [lng, lat],
      (client) => client`
        SELECT zone_code, zone_description FROM vicplan_overlays
        WHERE zone_code LIKE 'HO%'
          AND ST_Covers(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 10
      `
    );

    for (const row of hoRows) {
      sources.push('HO');
      details.push({
        source: 'HO',
        code: row.zone_code,
        name: row.zone_description,
        risk: 'high',
      });
    }
  } catch (err) {
    console.warn('[heritage-service] HO query error:', err.message);
  }

  // ── Source 2: Victorian Heritage Register ──
  try {
    const vhrRows = await queryRows(
      sql,
      `SELECT vhr_num, site_name FROM vhr_zones
       WHERE ST_Covers(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
       LIMIT 10`,
      [lng, lat],
      (client) => client`
        SELECT vhr_num, site_name FROM vhr_zones
        WHERE ST_Covers(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 10
      `
    );

    for (const row of vhrRows) {
      sources.push('VHR');
      details.push({
        source: 'VHR',
        code: row.vhr_num,
        name: row.site_name,
        risk: 'high',
      });
    }
  } catch (err) {
    console.warn('[heritage-service] VHR query error:', err.message);
  }

  const uniqueDetails = details.filter((detail, index, all) =>
    index === all.findIndex((candidate) =>
      candidate.source === detail.source && candidate.code === detail.code
    )
  );
  const uniqueSources = [...new Set(sources)];
  const flagged = uniqueSources.length > 0;
  return {
    flagged,
    sources: uniqueSources,
    details: uniqueDetails,
    discount: flagged ? -0.20 : 0,
    note: flagged
      ? `This property is subject to heritage designation (${uniqueSources.join(' + ')}). Valuation adjusted down by 20%.`
      : null,
  };
}

async function queryRows(sql, text, values, taggedQuery) {
  if (typeof sql === 'function') {
    const rows = await taggedQuery(sql);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  }
  if (sql?.query) {
    const result = await sql.query(text, values);
    return Array.isArray(result) ? result : (result?.rows || []);
  }
  return [];
}

export default { checkHeritage };
