/**
 * street-quality-service.js — 街道质量综合评分
 *
 * 输入一个地址 + suburb，输出 streetQualityScore（1-5）
 *
 * 评分维度（加权）:
 *   - AADT 交通量（权重 0.35）: 主干道高流量→低分，居住街道→高分
 *   - 街道价格百分位（权重 0.35）: 街道在 suburb 内的价格排名
 *   - OSM 道路类型分类（权重 0.20）: based on suffix + context
 *   - 街道朝向（权重 0.10）: 南北 vs 东西（影响澳洲采光溢价）
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 加载 AADT 数据 ──
let aadtBySuburb = null;
let aadtBySuburbUpper = null;

function loadAADT() {
  if (aadtBySuburb) return;
  const path = resolve(__dirname, "..", "data", "traffic_quality.json");
  if (!existsSync(path)) {
    console.warn("[street-quality] traffic_quality.json not found");
    aadtBySuburb = {};
    aadtBySuburbUpper = {};
    return;
  }
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const records = raw.records || [];
  aadtBySuburb = {};
  aadtBySuburbUpper = {};
  for (const rec of records) {
    const subUpper = rec.suburb.toUpperCase();
    aadtBySuburbUpper[subUpper] = rec.traffic_stats;
    aadtBySuburb[rec.suburb] = rec.traffic_stats;
  }
}

function getAADTForStreet(suburb, streetName) {
  loadAADT();
  const subUpper = (suburb || "").toUpperCase();
  const stats = aadtBySuburbUpper[subUpper];
  if (!stats) return null;

  // 尝试多种匹配
  const streetUpper = (streetName || "").toUpperCase().trim();
  const candidates = [
    streetUpper,
    streetUpper.replace(/\s+STREET\b/, " ST"),
    streetUpper.replace(/\s+ST\b/, " STREET"),
    streetUpper.replace(/\s+AVENUE\b/, " AVE"),
    streetUpper.replace(/\s+AVE\b/, " AVENUE"),
    streetUpper.replace(/\s+ROAD\b/, " RD"),
    streetUpper.replace(/\s+RD\b/, " ROAD"),
    streetUpper.replace(/\s+DRIVE\b/, " DR"),
    streetUpper.replace(/\s+DR\b/, " DRIVE"),
    streetUpper.replace(/\s+LANE\b/, " LN"),
    streetUpper.replace(/\s+CRESCENT\b/, " CRES"),
    streetUpper.replace(/\s+CRES\b/, " CRESCENT"),
    streetUpper.replace(/\s+TERRACE\b/, " TCE"),
    streetUpper.replace(/\s+TCE\b/, " TERRACE"),
    streetUpper.replace(/\s+CIRCUIT\b/, " CRT"),
    streetUpper.replace(/\s+COURT\b/, " CRT"),
    streetUpper.replace(/\s+HIGHWAY\b/, " HWY"),
    streetUpper.replace(/\s+HWY\b/, " HIGHWAY"),
    streetUpper.replace(/\s+BOULEVARD\b/, " BVD"),
    streetUpper.replace(/\s+BVD\b/, " BOULEVARD"),
  ];

  for (const c of candidates) {
    if (stats[c]) return stats[c];
  }

  // 尝试基于前缀部分匹配（例如 "MCINTOSH" 在 "MCINTOSH STREET" 内）
  for (const [key, val] of Object.entries(stats)) {
    if (key.startsWith(streetUpper) || streetUpper.startsWith(key.replace(/\s+(STREET|ST|ROAD|RD|AVE|AVENUE|DRIVE|DR|LANE|LN|CRES|CRESCENT|TCE|TERRACE|HWY|HIGHWAY|BVD|BOULEVARD)\s*$/, ""))) {
      return val;
    }
  }

  return null;
}

// ── OSM 道路类型（基于地址后缀） ──
const streetTypes = {
  primary: new Set(["HIGHWAY", "HWY", "MOTORWAY", "FREEWAY", "EXPRESSWAY", "BYPASS", "BY-PASS", "BOULEVARD"]),
  secondary: new Set(["ROAD", "RD", "STREET", "ST", "AVENUE", "AVE", "DRIVE", "DR"]),
  tertiary: new Set(["CRESCENT", "CRES", "LANE", "LN", "WAY", "BROADWAY"]),
  residential: new Set(["CLOSE", "PLACE", "COURT", "CRT", "CIRCUIT", "PARADE", "GARDEN", "GROVE", "GREEN", "VIEW", "VISTA", "RIDGE", "CREST", "HEIGHTS", "CHASE", "VALE", "MEADOW", "PARK", "TERRACE", "TCE", "WALK", "RISE", "GATE", "GLEN", "DELL", "BEND", "NOOK", "LEA", "FIELD", "BROOK", "DENE", "SIDE"]),
};

function osmRoadClassScore(streetSuffix) {
  const suffix = (streetSuffix || "").toUpperCase().trim();
  for (const key of ["residential", "tertiary", "secondary", "primary"]) {
    if (streetTypes[key].has(suffix)) {
      const map = { residential: 5, tertiary: 4, secondary: 3, primary: 2 };
      return map[key];
    }
  }
  return 3; // default
}

// ── 街道朝向 ──
/**
 * 从街道名推断大致朝向
 * 简单的启发式：如果路名包含方位 → 推断为与该方向垂直的走向
 * "North Road" → 东西向（服务于南北通勤）
 * "East Boundary" → 南北向
 */
function streetOrientationScore(streetName) {
  const name = (streetName || "").toUpperCase();
  // 东西向 → 澳洲 house 可以朝北 → 有利
  const eastWest = /\b(NORTH|SOUTH)\b/.test(name);
  const northSouth = /\b(EAST|WEST)\b/.test(name);

  if (eastWest && !northSouth) {
    // 东西向 → 最多 house 朝北面 → +0.5 分
    return { score: 5, orientation: "east-west" };
  }
  if (northSouth && !eastWest) {
    // 南北向 → 只有一半 house 朝北 → 基准
    return { score: 3, orientation: "north-south" };
  }
  // 无明确方向 → 默认
  return { score: 3, orientation: "unknown" };
}

/**
 * 从地址中提取街道名和后缀
 * "11 McIntosh St, Oakleigh" → { street: "McIntosh", suffix: "St" }
 * "2/6 Willgilson Court" → { street: "Willgilson", suffix: "Court" }
 */
function parseStreet(address) {
  if (!address) return { street: "", suffix: "" };
  // 去掉号码和 unit prefix
  let clean = address
    .replace(/^[\d\s\/]+\s*/g, "")  // 去掉 "2/6 "、"11 "
    .replace(/,.*$/, "")             // 去掉 suburb
    .trim();

  const parts = clean.split(/\s+/);
  const suffix = parts.length > 1 ? parts[parts.length - 1] : "";
  const street = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];

  return { street, suffix };
}

// ── 价格百分位 ──
/**
 * 从 acceptedComparables 中按街道分组，计算 subject 街道的价格百分位
 * @param {Array} comparables - accepted comparable sales
 * @param {string} subjectStreet - 街道名
 * @returns {number} 0-1 百分位
 */
function computeStreetPercentile(comparables, subjectStreet) {
  if (!comparables || !comparables.length || !subjectStreet) return 0.5;

  // 按街道分组
  const byStreet = {};
  for (const c of comparables) {
    const { street } = parseStreet(c.address || "");
    if (!street) continue;
    if (!byStreet[street]) byStreet[street] = [];
    byStreet[street].push(c.timeAdjustedPrice || c.salePrice || 0);
  }

  const subUpper = subjectStreet.toUpperCase();
  let subjectPrices = [];
  let allPrices = [];

  for (const [street, prices] of Object.entries(byStreet)) {
    allPrices.push(...prices);
    if (street.toUpperCase() === subUpper) {
      subjectPrices = prices;
    }
  }

  if (!subjectPrices.length) return 0.5; // unknown

  const subjectMedian = median(subjectPrices);
  const allSorted = [...allPrices].sort((a, b) => a - b);
  const below = allSorted.filter(p => p <= subjectMedian).length;
  return allSorted.length > 0 ? below / allSorted.length : 0.5;
}

function median(arr) {
  if (!arr || !arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * 计算 AADT 分数（1-5）
 * 不在 AADT 数据中的街道 → 默认低流量（高分 5）
 */
function aadtScore(aadtStats) {
  if (!aadtStats) return 5; // 不在主干道数据中 = 低流量 = 高分
  const avgAadt = aadtStats.aadt_avg;
  if (avgAadt == null) return 5;
  if (avgAadt <= 2000) return 5;
  if (avgAadt <= 5000) return 4;
  if (avgAadt <= 8000) return 3;
  if (avgAadt <= 15000) return 2;
  return 1; // high traffic
}

/**
 * 综合街道质量评分
 * @param {string} address - 完整地址（如 "11 McIntosh St, Oakleigh VIC"）
 * @param {string} suburb - suburb 名
 * @param {Array} [comparables] - 可选，accepted comparables 用于价格百分位计算
 * @returns {number} 1-5 分
 */
export function computeStreetQuality(address, suburb, comparables = []) {
  const { street, suffix } = parseStreet(address);
  if (!street) return 3; // 无法解析，默认中等

  // 1. AADT 分（weight 0.35）
  const aadtStats = getAADTForStreet(suburb, street + " " + suffix);
  const aadtScoreVal = aadtScore(aadtStats);

  // 2. 价格百分位（weight 0.35）
  const pct = computeStreetPercentile(comparables, street);
  const priceScoreVal = 1 + pct * 4; // 0-1 → 1-5

  // 3. OSM 道路类型（weight 0.20）
  const osmScore = osmRoadClassScore(suffix);

  // 4. 街道朝向（weight 0.10）
  const { score: orientationScore } = streetOrientationScore(street + " " + suffix);

  // 加权
  const finalScore =
    aadtScoreVal * 0.35 +
    priceScoreVal * 0.35 +
    osmScore * 0.20 +
    orientationScore * 0.10;

  return Math.round(finalScore);
}

/**
 * Debug: 返回 street quality 的详细分解
 */
export function explainStreetQuality(address, suburb, comparables = []) {
  const { street, suffix } = parseStreet(address);
  if (!street) return { score: 3, components: [], note: "无法解析地址" };

  const aadtStats = getAADTForStreet(suburb, street + " " + suffix);
  const aadtScoreVal = aadtScore(aadtStats);
  const pct = computeStreetPercentile(comparables, street);
  const priceScoreVal = 1 + pct * 4;
  const osmScore = osmRoadClassScore(suffix);
  const { score: orientationScore, orientation } = streetOrientationScore(street + " " + suffix);

  const components = [
    { name: "AADT交通量", weight: 0.35, score: aadtScoreVal, detail: aadtStats ? `AADT ${aadtStats.aadt_avg}` : "不在主干道=低流量" },
    { name: "街道价格水平", weight: 0.35, score: priceScoreVal, detail: `百分位 ${(pct * 100).toFixed(0)}%` },
    { name: "道路类型", weight: 0.20, score: osmScore, detail: `后缀 "${suffix}"` },
    { name: "街道朝向", weight: 0.10, score: orientationScore, detail: orientation },
  ];
  const finalScore = components.reduce((s, c) => s + c.score * c.weight, 0);

  return {
    score: Math.round(finalScore),
    rawScore: finalScore,
    components,
    aadtCovered: !!aadtStats,
    aadtRaw: aadtStats || null,
  };
}
