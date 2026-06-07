/**
 * RBA Client — 免费下载 RBA 官方经济数据
 *
 * 数据来源:
 *   F1.1 — Interest Rates & Yields (monthly averages)
 *     现金利率、银行票据收益率、OIS、国库券
 *   F5 — Indicator Lending Rates (monthly)
 *     住房贷款利率（浮动/固定）、投资房利率
 *
 * 核心设计:
 *   - 全免费，无需 API Key
 *   - CSV 格式直接下载解析
 *   - 缓存减少重复请求
 *   - 使用 Series ID 精确定位数据列（比文本匹配更可靠）
 *
 * 使用:
 *   import { getRateEnvironment } from "./lib/rba-client.js";
 *   const rates = await getRateEnvironment();
 *   // → { cashRate: 4.35, lendingRates: { ... }, ... }
 */

const RBA_CSV_BASE = "https://www.rba.gov.au/statistics/tables/csv";
const CACHE_TTL_MS = 600_000; // 10 min

// ── F5 贷款系列 ID 定义 ──
// Series ID 在第 11 行（index 10），数据从第 12 行（index 11）开始
const F5_SERIES = {
  smallBizVariableTerm: {
    id: "FILRSBVRT",
    label: "Small business; Variable; Term",
  },
  smallBizVariableOverdraft: {
    id: "FILRSBVOO",
    label: "Small business; Variable; Overdraft",
  },
  housingBanksStdVariableOO: {
    id: "FILRHLBVS",
    label: "Housing; Banks; Variable; Standard; Owner-occupier",
  },
  housingBanksDiscountedVariableOO: {
    id: "FILRHLBVD",
    label: "Housing; Banks; Variable; Discounted; Owner-occupier",
  },
  housingBanksStdInterestOnlyOO: {
    id: "FILRHLBVO",
    label: "Housing; Banks; Variable; Standard interest-only; Owner-occupier",
  },
  housingBanks3YearFixedOO: {
    id: "FILRHL3YF",
    label: "Housing; Banks; 3-year fixed; Owner-occupier",
  },
  housingBanksStdVariableInvestor: {
    id: "FILRHLBVSI",
    label: "Housing; Banks; Variable; Standard; Investor",
  },
  housingBanksDiscountedVariableInvestor: {
    id: "FILRHLBVDI",
    label: "Housing; Banks; Variable; Discounted; Investor",
  },
  housingBanksStdInterestOnlyInvestor: {
    id: "FILRHLBVDO",
    label: "Housing; Banks; Variable; Standard interest-only; Investor",
  },
  housingBanks3YearFixedInvestor: {
    id: "FILRHL3YFI",
    label: "Housing; Banks; 3-year fixed; Investor",
  },
  creditCardStandard: {
    id: "FILRPLRCCS",
    label: "Standard rate credit card",
  },
  creditCardLowRate: {
    id: "FILRPLRCCL",
    label: "Low rate credit card",
  },
  smallBizWeightedAvg: {
    id: "FILRSBVWA",
    label: "Small business; Weighted-average rate on credit outstanding",
  },
};

/**
 * 解析 RBA 多行列头 CSV，返回 { columns, data, seriesIndex }
 */
function parseRBACSV(csv) {
  const lines = csv.trim().split("\n");
  if (lines.length < 12) {
    return { error: "CSV too short" };
  }

  // Series ID 行 (index 10)
  const seriesIdLine = lines[10];
  const colSeries = parseCSVLine(seriesIdLine);

  // 标题行为 index 1
  const titleLine = lines[1];
  const colTitles = parseCSVLine(titleLine);

  // 构建列映射：seriesId → colIndex
  const seriesMap = {};
  for (let i = 1; i < colSeries.length; i++) {
    const id = colSeries[i]?.trim();
    if (id) {
      seriesMap[id] = {
        index: i,
        seriesId: id,
        title: colTitles[i]?.trim() || "",
      };
    }
  }

  // 解析数据行（index 11+）
  const data = [];
  for (let i = 11; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCSVLine(lines[i]);
    const dateStr = vals[0]?.trim();
    if (!dateStr) continue;

    const row = { date: dateStr };
    for (let j = 1; j < vals.length; j++) {
      const val = vals[j]?.trim() || "";
      if (val === "" || val === "..") continue;
      const num = parseFloat(val);
      row[colSeries[j]] = isNaN(num) ? val : num;
    }
    data.push(row);
  }

  return { seriesMap, data, seriesCount: Object.keys(seriesMap).length };
}

/**
 * 获取 F1.1 月度利率数据
 * @returns {Promise<Object>}
 */
export async function getCashRateData() {
  const url = `${RBA_CSV_BASE}/f1.1-data.csv`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`RBA F1.1 error: ${response.status}`);
  }
  const csv = await response.text();
  const parsed = parseRBACSV(csv);
  if (parsed.error) throw new Error(`RBA F1.1 parse error: ${parsed.error}`);

  const data = parsed.data;
  const latest = data.length > 0 ? data[data.length - 1] : null;

  // F1.1 系列 ID: 查找现金利率
  // 实际系列名以 FIRM 开头，最后列含 "Cash Rate Target" 标题
  let cashRateKey = null;
  for (const [id, info] of Object.entries(parsed.seriesMap)) {
    if (info.title && info.title.includes("Cash Rate Target")) {
      cashRateKey = id;
      break;
    }
  }

  const summary = {};
  if (latest && cashRateKey) {
    summary.cashRate = latest[cashRateKey];
  } else if (latest) {
    // fallback: 拿最后列
    const keys = Object.keys(latest).filter((k) => k !== "date");
    if (keys.length > 0) summary.cashRate = latest[keys[keys.length - 1]];
  }

  return {
    source: "RBA F1.1 Interest Rates (Monthly Averages)",
    latestDate: latest?.date || null,
    summary,
    dataLength: data.length,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * 获取 F5 贷款指示利率
 * @returns {Promise<Object>}
 */
export async function getLendingRates() {
  const url = `${RBA_CSV_BASE}/f5-data.csv`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`RBA F5 error: ${response.status}`);
  }
  const csv = await response.text();
  const parsed = parseRBACSV(csv);
  if (parsed.error) throw new Error(`RBA F5 parse error: ${parsed.error}`);

  const data = parsed.data;
  if (data.length === 0) {
    return {
      source: "RBA F5 Indicator Lending Rates",
      latestDate: null,
      summary: {},
      dataLength: 0,
      fetchedAt: new Date().toISOString(),
    };
  }

  const latest = data[data.length - 1];

  const extract = (key) => {
    const id = F5_SERIES[key]?.id;
    return id && latest[id] != null ? latest[id] : null;
  };

  const summary = {
    stdVariableOwnerOccupier: extract("housingBanksStdVariableOO"),
    discountedVariableOwnerOccupier: extract("housingBanksDiscountedVariableOO"),
    stdVariableInvestor: extract("housingBanksStdVariableInvestor"),
    threeYearFixedOwnerOccupier: extract("housingBanks3YearFixedOO"),
    threeYearFixedInvestor: extract("housingBanks3YearFixedInvestor"),
    creditCardStandard: extract("creditCardStandard"),
    smallBizVariableTerm: extract("smallBizVariableTerm"),
    smallBizWeightedAvg: extract("smallBizWeightedAvg"),
  };

  return {
    source: "RBA F5 Indicator Lending Rates (Monthly)",
    latestDate: latest.date,
    summary,
    series: Object.entries(F5_SERIES).map(([k, v]) => ({ name: k, id: v.id, label: v.label, value: latest[v.id] ?? null })),
    dataLength: data.length,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * === 一站式接口 ===
 */
export async function getRateEnvironment() {
  const [cash, lending] = await Promise.all([
    getCashRateData(),
    getLendingRates(),
  ]);

  return {
    source: "RBA Statistical Tables",
    fetchedAt: new Date().toISOString(),
    cashRate: cash.summary.cashRate ?? null,
    latestCashRateDate: cash.latestDate,
    lendingRates: lending.summary || {},
    lendingRatesDate: lending.latestDate,
  };
}

// ── CSV 行解析（处理引号内逗号） ──
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
