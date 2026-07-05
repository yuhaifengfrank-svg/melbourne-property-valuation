/**
 * poi-service.js — OSM POI query and scoring
 *
 * Uses the Overpass API (GET) to count points of interest around suburb centroids.
 * Categorizes POIs into 8 property-relevant factors.
 *
 * Uses named sets + `out count;` for per-category counts in a single fast query.
 * Nodes only (no ways) for speed — Overpass way geometries in `around:` are slow.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const QUERY_TIMEOUT = 15; // seconds per query

// ── POI Category Definitions ──
export const POI_CATEGORIES = {
  healthcare: {
    key: 'amenity',
    values: ['hospital', 'clinic', 'pharmacy'],
    radius: 3000,
    weight: 0.20,
    benchmark: 30,
    label: 'Healthcare'
  },
  shopping: {
    key: 'shop',
    values: ['supermarket', 'mall', 'convenience', 'department_store'],
    radius: 2000,
    weight: 0.15,
    benchmark: 15,
    label: 'Shopping'
  },
  recreation: {
    key: 'leisure',
    values: ['park', 'playground', 'sports_centre', 'garden', 'nature_reserve'],
    radius: 2000,
    weight: 0.15,
    benchmark: 20,
    label: 'Recreation'
  },
  dining: {
    key: 'amenity',
    values: ['restaurant', 'cafe', 'pub', 'bar', 'fast_food'],
    radius: 2000,
    weight: 0.10,
    benchmark: 40,
    label: 'Dining'
  },
  transit: {
    key: 'railway',
    values: ['station'],
    radius: 2000,
    weight: 0.15,
    benchmark: 5,
    label: 'Transit'
  },
  education: {
    key: 'amenity',
    values: ['kindergarten', 'library', 'college', 'university'],
    radius: 3000,
    weight: 0.10,
    benchmark: 10,
    label: 'Education'
  },
  fitness: {
    key: 'leisure',
    values: ['swimming_pool', 'fitness_centre'],
    radius: 3000,
    weight: 0.05,
    benchmark: 5,
    label: 'Fitness'
  },
  public_services: {
    key: 'amenity',
    values: ['police', 'fire_station', 'post_office', 'townhall', 'community_centre'],
    radius: 3000,
    weight: 0.10,
    benchmark: 6,
    label: 'Public Services'
  }
};

const CATEGORY_KEYS = Object.keys(POI_CATEGORIES);
const LETTERS = 'abcdefghij'.split('');

// ── Overpass Query Builder (named sets + out count) ──

/**
 * Build a single Overpass QL query that counts POIs per category
 * using named sets and `out count;`. Nodes only for speed.
 * @param {number} lat
 * @param {number} lon
 * @returns {string} Overpass QL
 */
function buildCountQuery(lat, lon) {
  const lines = [`[out:json][timeout:${QUERY_TIMEOUT}];`];

  for (let i = 0; i < CATEGORY_KEYS.length; i++) {
    const cat = CATEGORY_KEYS[i];
    const def = POI_CATEGORIES[cat];
    const set = LETTERS[i];

    if (def.key === 'railway') {
      lines.push(`node["railway"="station"](around:${def.radius},${lat},${lon})->.${set};`);
    } else {
      const pattern = def.values.map(v => v).join('|');
      lines.push(`node["${def.key}"~"^(${pattern})$"](around:${def.radius},${lat},${lon})->.${set};`);
    }
  }

  // Output counts for each set
  for (let i = 0; i < CATEGORY_KEYS.length; i++) {
    lines.push(`.${LETTERS[i]} out count;`);
  }

  return lines.join('\n');
}

// ── Main Query Function ──

/**
 * Query Overpass API for POI counts around a location.
 * @param {number} lat
 * @param {number} lon
 * @param {object} [options]
 * @param {number} [options.retries=2]
 * @returns {Promise<{counts: object, total: number}>}
 */
export async function fetchPoiCounts(lat, lon, options = {}) {
  // Force IPv4 to avoid IPv6 timeout issues to overpass-api.de
  try {
    const { setDefaultResultOrder } = await import('node:dns');
    setDefaultResultOrder('ipv4first');
  } catch (e) { /* DNS fix not critical */ }
  const { retries = 2 } = options;
  const ql = buildCountQuery(lat, lon);

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = new URL(OVERPASS_URL);
      url.searchParams.set('data', ql);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AusHomeValue/1.0 (property research; mailto:admin@aushomevalue.com.au)'
        },
        signal: AbortSignal.timeout((QUERY_TIMEOUT + 5) * 1000)
      });

      if (!response.ok) {
        throw new Error(`Overpass HTTP ${response.status}`);
      }

      const data = await response.json();
      return parseNamedCounts(data.elements);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Failed to query Overpass API');
}

/**
 * Parse named out count results into per-category counts.
 * @param {Array} elements
 * @returns {{counts: object, total: number}}
 */
function parseNamedCounts(elements) {
  const counts = {};
  let total = 0;

  for (let i = 0; i < Math.min(elements.length, CATEGORY_KEYS.length); i++) {
    const el = elements[i];
    if (el.type === 'count' && el.tags) {
      const catCount = parseInt(el.tags.total || el.tags.nodes || '0', 10);
      counts[CATEGORY_KEYS[i]] = catCount;
      total += catCount;
    } else {
      counts[CATEGORY_KEYS[i]] = 0;
    }
  }

  return { counts, total };
}

// ── Scoring ──

/**
 * Compute normalized POI scores (0-100) from raw counts.
 * @param {object} counts - { category: count, ... }
 * @returns {{scores: object, composite: number}}
 */
export function computePoiScores(counts) {
  const scores = {};
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [cat, def] of Object.entries(POI_CATEGORIES)) {
    const count = counts[cat] || 0;
    const ratio = count / def.benchmark;
    const score = Math.round(Math.min(ratio, 1.5) * 66.7);
    scores[`poi_${cat}_score`] = Math.min(score, 100);
    weightedSum += score * def.weight;
    totalWeight += def.weight;
  }

  const composite = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  return { scores, composite: Math.min(composite, 100) };
}

// ── Standalone Usage ──
if (process.argv[1] && (process.argv[1].endsWith('poi-service.js') || import.meta.url.endsWith(encodeURIComponent(process.argv[1])))) {
  const [lat, lon] = process.argv.slice(2);
  if (!lat || !lon) {
    console.error('Usage: node lib/poi-service.js <lat> <lon>');
    process.exit(1);
  }
  const result = await fetchPoiCounts(parseFloat(lat), parseFloat(lon));
  const scored = computePoiScores(result.counts);
  console.log('Counts:', JSON.stringify(result.counts, null, 2));
  console.log('Scores:', JSON.stringify(scored.scores, null, 2));
  console.log('Composite:', scored.composite);
  console.log('Total POIs:', result.total);
}
