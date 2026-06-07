/**
 * ABS Client — 免费接入 ABS Data API (Beta)
 *
 * 接入的数据集:
 *   C21_T02_SA2 — Census 2021 Selected medians and averages (SA2 级别)
 *     → 中位收入、中位租金、中位按揭、中位年龄、平均 household size
 *   ABS_SEIFA2021_SA2 — SEIFA 2021 by SA2
 *     → IRSAD/IRSD/IER/IEO 评分、排名、分位数
 *   ABS_ANNUAL_ERP_ASGS2021 — 人口估计 (ERP) by SA2
 *     → 人口总数、年龄分布
 *
 * 核心设计:
 *   - 全免费，无需 API Key
 *   - ESM module, 与项目现有风格一致
 *   - 以 SA2 为查询单位（Census 标准地理单位，约≈suburb 大小）
 *   - 缓存避免重复调用（单次 session 内）
 *
 * 使用:
 *   import { getSuburbProfile } from "./lib/abs-client.js";
 *   const profile = await getSuburbProfile("Camberwell", "VIC");
 */

const ABS_BASE = "https://data.api.abs.gov.au/rest/data";
const CACHE_TTL_MS = 3600_000; // 1 hour

// ── SA2 名称 → 代码 查找表（从 T02 数据集预缓存） ──
let _sa2Cache = null;
let _cacheTimestamp = 0;

/**
 * 获取所有 SA2 区域列表（含代码+名称+州）
 * @returns {Promise<Array<{code:string, name:string, state:string}>>}
 */
async function listSA2Regions() {
  if (_sa2Cache && Date.now() - _cacheTimestamp < CACHE_TTL_MS) {
    return _sa2Cache;
  }

  const url = `${ABS_BASE}/ABS,C21_T02_SA2,1.0.0/.?startPeriod=2021`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.sdmx.data+csv;labels=both" },
  });

  if (!response.ok) {
    throw new Error(`ABS API error: ${response.status} ${response.statusText}`);
  }

  const csv = await response.text();
  const regions = new Map();
  const lines = csv.trim().split("\n");

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 5) continue;

    const regionField = cols[2];       // e.g. "207011149: Camberwell"
    const regionType = cols[3];        // e.g. "SA2: Statistical Area Level 2"
    const stateField = cols[4];        // e.g. "2: Victoria"

    if (!regionType.includes("SA2")) continue;

    const [code, ...nameParts] = regionField.split(":");
    const name = nameParts.join(":").trim();
    const stateMatch = stateField.match(/^\d+:\s*(.+)$/);
    const state = stateMatch ? stateMatch[1].trim() : "";

    const key = `${code}|${name}|${state}`;
    if (!regions.has(key)) {
      regions.set(key, { code, name, state });
    }
  }

  _sa2Cache = Array.from(regions.values());
  _cacheTimestamp = Date.now();
  return _sa2Cache;
}

/**
 * 按 suburb 名称 + 州 查找 SA2 代码
 */
/** State 缩写 → 全称映射 */
const STATE_MAP = {
  'ACT': 'AUSTRALIAN CAPITAL TERRITORY',
  'NSW': 'NEW SOUTH WALES',
  'NT': 'NORTHERN TERRITORY',
  'QLD': 'QUEENSLAND',
  'SA': 'SOUTH AUSTRALIA',
  'TAS': 'TASMANIA',
  'VIC': 'VICTORIA',
  'WA': 'WESTERN AUSTRALIA',
};

function normalizeState(state) {
  return (STATE_MAP[state.toUpperCase()] || state).toUpperCase();
}

async function findSA2(suburb, state) {
  const regions = await listSA2Regions();
  const stateFull = (STATE_MAP[state.toUpperCase()] || state).toUpperCase();
  const suburbLower = suburb.toLowerCase();

  // 精确匹配
  let exact = regions.filter(
    (r) =>
      r.name.toLowerCase() === suburbLower &&
      r.state.toUpperCase() === stateFull
  );

  if (exact.length === 1) return exact[0];

  // 名称包含匹配
  let partial = regions.filter(
    (r) =>
      r.name.toLowerCase().includes(suburbLower) &&
      r.state.toUpperCase() === stateFull
  );

  if (partial.length === 1) return partial[0];

  // 多个匹配时，选名称长度最接近的（避免 Bentleigh 匹配 Bentleigh East - South/North）
  if (partial.length > 1) {
    const best = partial.sort((a, b) => Math.abs(a.name.length - suburb.length) - Math.abs(b.name.length - suburb.length))[0];
    return best;
  }

  // 尝试跨州搜索
  let anyState = regions.filter((r) =>
    r.name.toLowerCase().includes(suburbLower)
  );

  if (anyState.length > 0) {
    return {
      matches: anyState,
      ambiguous: true,
      note: `No "${suburb}" found in ${stateFull}, showing other states`,
    };
  }

  return null;
}

/**
 * 获取 suburb 的 Census 2021 中位数概况
 * @param {string} sa2Code - SA2 区域代码
 * @returns {Promise<Object>}
 */
async function getCensusMedians(sa2Code) {
  const url = `${ABS_BASE}/ABS,C21_T02_SA2,1.0.0/.?startPeriod=2021`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.sdmx.data+csv;labels=both" },
  });

  if (!response.ok) {
    throw new Error(`ABS API error: ${response.status} ${response.statusText}`);
  }

  const csv = await response.text();
  const lines = csv.trim().split("\n");

  const result = {
    source: "ABS Census 2021, C21_T02_SA2",
    year: 2021,
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 7) continue;

    const regionField = cols[2];
    const statCodeLabels = cols[1];
    const value = cols[6];

    // Check if this row is for our SA2 code
    const regionCode = regionField.split(":")[0].trim();
    if (regionCode !== sa2Code) continue;

    const statLabel = statCodeLabels.replace(/^\d+:\s*/, "").trim();

    switch (statLabel) {
      case "Median age of persons":
        result.medianAge = parseFloat(value);
        break;
      case "Median total personal income ($/weekly)":
        result.medianPersonalIncome = parseInt(value, 10);
        break;
      case "Median total family income ($/weekly)":
        result.medianFamilyIncome = parseInt(value, 10);
        break;
      case "Median total household income ($/weekly)":
        result.medianHouseholdIncome = parseInt(value, 10);
        break;
      case "Median mortgage repayment ($/monthly)":
        result.medianMortgageRepayment = parseInt(value, 10);
        break;
      case "Median rent ($/weekly)":
        result.medianRent = parseInt(value, 10);
        break;
      case "Average household size":
        result.averageHouseholdSize = parseFloat(value);
        break;
      case "Average number of persons per bedroom":
        result.averagePersonsPerBedroom = parseFloat(value);
        break;
    }
  }

  return result;
}

/**
 * 获取 suburb 的 SEIFA 2021 数据
 * @param {string} sa2Code - SA2 区域代码
 * @returns {Promise<Object>}
 */
async function getSEIFA(sa2Code) {
  const url = `${ABS_BASE}/ABS,ABS_SEIFA2021_SA2,1.0.0/.?startPeriod=2021`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.sdmx.data+csv;labels=both" },
  });

  if (!response.ok) {
    throw new Error(`ABS API error: ${response.status} ${response.statusText}`);
  }

  const csv = await response.text();
  const lines = csv.trim().split("\n");

  const seifa = {
    source: "ABS SEIFA 2021",
    year: 2021,
    indexes: {},
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 7) continue;

    const regionField = cols[1];
    const regionCode = regionField.split(":")[0].trim();
    if (regionCode !== sa2Code) continue;

    const indexType = cols[2];
    const measure = cols[3];
    const value = cols[5];

    const indexName = indexType.split(":")[0].trim();
    const measureLabel = measure.replace(/^[A-Z]+:\s*/, "").trim();
    const indexLabel = indexType.replace(/^[A-Z]+:\s*/, "").trim();

    if (!seifa.indexes[indexName]) {
      seifa.indexes[indexName] = { label: indexLabel };
    }
    seifa.indexes[indexName][measureLabel] = isNaN(Number(value))
      ? value
      : Number(value);
  }

  // 提取常用数据到顶层
  const irsad = seifa.indexes["IRSAD"] || {};
  const ird = seifa.indexes["IRSD"] || {};
  const ier = seifa.indexes["IER"] || {};
  const ieo = seifa.indexes["IEO"] || {};

  seifa.population = ird["Usual resident population"] || ier["Usual resident population"] || null;
  seifa.decileAustralia = irsad["Rank within Australia - Decile"] || null;
  seifa.decileState = irsad["Rank within State or Territory - Decile"] || null;
  seifa.percentileState = irsad["Rank within State or Territory - Percentile"] || null;
  seifa.scoreIRSAD = irsad["Maximum score for SA1s in area"] || null;

  return seifa;
}

/**
 * 获取 suburb 人口估计
 */
async function getERP(sa2Code, year = 2021) {
  const url = `${ABS_BASE}/ABS,ABS_ANNUAL_ERP_ASGS2021,1.0.0/.?startPeriod=${year}&endPeriod=${year}`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.sdmx.data+csv;labels=both" },
  });

  if (!response.ok) {
    throw new Error(`ABS API error: ${response.status} ${response.statusText}`);
  }

  const csv = await response.text();
  const lines = csv.trim().split("\n");

  let totalPop = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 8) continue;

    const regionField = cols[2];
    const regionCode = regionField.split(":")[0].trim();

    if (regionCode === sa2Code) {
      const freq = cols[3] || "";
      if (freq.includes("Total") || freq.includes("total") || freq === "_T") {
        totalPop += parseInt(cols[7] || "0", 10);
      }
    }
  }

  return {
    source: "ABS ERP ASGS 2021",
    year,
    sa2Code,
    population: totalPop || null,
  };
}

/**
 * === 一站式接口 ===
 * 输入 suburb 名称 + 州，返回完整的 profile
 *
 * @param {string} suburb - e.g. "Camberwell"
 * @param {string} state  - e.g. "VIC"
 * @param {Object} [opts]
 * @param {boolean} [opts.includeERP=true] - 是否需要人口数据
 * @returns {Promise<Object>}
 */
export async function getSuburbProfile(suburb, state, opts = {}) {
  const { includeERP = true } = opts;

  const sa2 = await findSA2(suburb, state);
  if (!sa2) {
    return { ok: false, error: `Suburb "${suburb}" not found in ${state}` };
  }
  if (sa2.ambiguous) {
    return { ok: false, error: `Multiple SA2 matches found`, matches: sa2.matches };
  }

  const [medians, seifa] = await Promise.all([
    getCensusMedians(sa2.code),
    getSEIFA(sa2.code),
  ]);

  let erp = null;
  if (includeERP) {
    try { erp = await getERP(sa2.code); } catch { erp = { error: "ERP dataset not available" }; }
  }

  return {
    ok: true,
    suburb: sa2.name,
    state: sa2.state,
    sa2Code: sa2.code,
    medians,
    seifa,
    erp,
    fetchedAt: new Date().toISOString(),
  };
}

/**
  });
}

/**
 * 列出所有匹配某个名称的 SA2 区域（用于地址输入时的自动补全）
 */
export async function searchSA2(query, state) {
  const regions = await listSA2Regions();
  const q = query.toLowerCase();
  return regions.filter((r) => {
    const matchName = r.name.toLowerCase().includes(q);
    if (!state) return matchName;
    const rState = normalizeState(r.state);
    const qState = normalizeState(state);
    return matchName && rState === qState;
  });
}

// ── 简易 CSV 行解析（处理引号内逗号） ──
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
