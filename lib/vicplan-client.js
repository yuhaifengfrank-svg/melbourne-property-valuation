/**
 * VicPlan Client — 免费获取 Vic 规划/地理数据
 *
 * 数据来源:
 *   OpenStreetMap Nominatim — 地址→坐标 地理编码
 *   Overpass API — 获取 suburb 级别的建筑、土地利用特征
 *   VicPlan MapShare — 提供官方规划查询链接（用户可手动访问确认）
 *
 * 核心设计:
 *   - 全免费，无需 API Key
 *   - Nominatim 1 req/s 限制（遵循公平使用政策）
 *   - Overpass API GET 请求查询土地利用/建筑密度等特征
 *   - 提供官方 VicPlan 查询 URL 供手动深度核查
 *
 * 使用:
 *   import { getSuburbGeodata } from "./lib/vicplan-client.js";
 *   const geo = await getSuburbGeodata("Camberwell", "VIC");
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OVERPASS_BASE = "https://overpass-api.de/api/interpreter";

// ── 地理编码（地址 → 坐标） ──

let _lastNominatimRequest = 0;

/**
 * 通过 Nominatim 将 suburb 名称转译为经纬度坐标
 * @param {string} query - 查询词，e.g. "Camberwell VIC 3124"
 * @returns {Promise<{lat, lon, displayName, boundingBox, suburb, state} | null>}
 */
export async function geocodeSuburb(query) {
  const now = Date.now();
  const elapsed = now - _lastNominatimRequest;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }

  const url = `${NOMINATIM_BASE}/search?format=json&limit=1&q=${encodeURIComponent(query)}&addressdetails=1`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Aushomevalue/1.0 (research project)" },
  });
  _lastNominatimRequest = Date.now();

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  const data = await response.json();
  if (!data || data.length === 0) return null;

  const result = data[0];
  const addr = result.address || {};

  return {
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
    displayName: result.display_name,
    boundingBox: result.boundingbox.map(Number),
    osmType: result.osm_type,
    osmId: result.osm_id,
    placeId: result.place_id,
    suburb: addr.suburb || addr.town || addr.city || "",
    state: addr.state || "",
    postcode: addr.postcode || "",
  };
}

/**
 * 解析 suburb + state，不依赖 postcode
 * @param {string} suburb
 * @param {string} state
 * @returns {Promise<Object>}
 */
export async function findSuburb(suburb, state) {
  let geo = await geocodeSuburb(`${suburb} ${state} Australia`);
  if (geo) return geo;

  geo = await geocodeSuburb(`${suburb} Australia`);
  if (geo) {
    if (geo.state.toLowerCase().includes(state.toLowerCase())) {
      return geo;
    }
    return { ...geo, stateMismatch: true, expectedState: state };
  }

  return null;
}

// ── Overpass API 查询（地产相关特征） ──

/**
 * 获取 suburb 的土地利用/建筑概况
 * @param {number} lat - 中心纬度
 * @param {number} lon - 中心经度
 * @param {number} radius - 搜索半径（米）
 * @returns {Promise<Object>}
 */
export async function getSuburbFeatures(lat, lon, radius = 1000) {
  const query = `
    [out:json];
    (
      way["landuse"](around:${radius},${lat},${lon});
      way["building"](around:${radius},${lat},${lon});
    );
    out center tags;
  `;

  // Overpass API 使用 GET，参数 URL 编码
  const url = `${OVERPASS_BASE}?data=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Accept": "application/json, */*;q=0.9"
    }
  });

  if (!response.ok) {
    throw new Error(`Overpass error: ${response.status}`);
  }

  const data = await response.json();
  const elements = data.elements || [];

  // 统计土地利用类型
  const landuseCounts = {};
  let buildingCount = 0;

  for (const el of elements) {
    const tags = el.tags || {};
    const landuse = tags.landuse;
    if (landuse) {
      landuseCounts[landuse] = (landuseCounts[landuse] || 0) + 1;
    }
    if (tags.building) {
      buildingCount++;
    }
  }

  const sortedLanduse = Object.entries(landuseCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  return {
    totalElements: elements.length,
    buildingCount,
    landuseTypes: sortedLanduse,
    landuseSummary: sortedLanduse.slice(0, 5).map((l) => l.type).join(", "),
  };
}

/**
 * 获取 VicPlan 官方查询 URL（供手动核查）
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @returns {string}
 */
export function getVicPlanUrl(lat, lon) {
  return `https://mapshare.vic.gov.au/vicplan/?x=${lon}&y=${lat}&zoom=16`;
}

// ── 一站式接口 ──

/**
 * 获取 suburb 完整地理/规划概况
 *
 * @param {string} suburb - e.g. "Camberwell"
 * @param {string} state  - e.g. "VIC"
 * @param {Object} [opts]
 * @param {number} [opts.radius=1000] - 搜索半径（米）
 * @returns {Promise<Object>}
 */
export async function getSuburbGeodata(suburb, state, opts = {}) {
  const { radius = 1000 } = opts;

  const geo = await findSuburb(suburb, state);
  if (!geo) {
    return { ok: false, error: `Suburb "${suburb}" not found` };
  }
  if (geo.stateMismatch) {
    return {
      ok: false,
      error: `Found "${suburb}" in ${geo.state}, not ${geo.expectedState}`,
      geo,
    };
  }

  const features = await getSuburbFeatures(geo.lat, geo.lon, radius);
  const vicplanUrl = getVicPlanUrl(geo.lat, geo.lon);

  return {
    ok: true,
    suburb: geo.suburb,
    state: geo.state,
    geo,
    features,
    vicplanUrl,
    fetchedAt: new Date().toISOString(),
  };
}
