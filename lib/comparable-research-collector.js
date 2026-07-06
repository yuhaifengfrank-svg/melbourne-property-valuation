// ── Comparable Research Collector ──
// L0-L7 搜索计划 + 浏览器抓取 + 合并去重 + 公共数据
// 保留 Codex 的地址解析、搜索计划、报告格式
// 替换 fetchWithTimeout → OpenClaw CDP 浏览器抓取
// 新增：browser-based REA/Domain 解析 + 直接输出引擎可用格式

import { scrapeSoldData, formatAsComparables } from "./browser-collector.js";

// ════════════════════════════════════════════
// 以下全部保留 Codex 原有的辅助函数（地址解析、搜索计划等）
// ════════════════════════════════════════════

const DEFAULT_TIMEOUT_MS = 6500;
const STATE_NAMES = ["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

export function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeAddress(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\boakley\b|\boaklrigh\b/g, "oakleigh")
    .replace(/\bmelnourne\b|\bmelbourn\b/g, "melbourne")
    .replace(/\bapt(\d+)\b/g, "apt $1")
    .replace(/\bapartment(\d+)\b/g, "apartment $1")
    .replace(/\bu\s*(\d+)\b/g, "unit $1")
    .replace(/\bunit(\d+)\b/g, "unit $1")
    // AU address convention: "2-11 mcintosh st" = Unit 2, 11 McIntosh St (not a range)
    // Normalize to "2/11" so addressSignature treats it as a unit correctly
    .replace(/\b(\d+)\s*-\s*(\d+)\b/g, "$1/$2")
    .replace(/\b(no|num|number|#)\s*(\d+)\b/g, "$2")
    .replace(/[,.-]/g, " ")
    .replace(/\bst\b/g, "street")
    .replace(/\bav\b|\bave\b/g, "avenue")
    .replace(/\brd\b/g, "road")
    .replace(/\bgr\b/g, "grove")
    .replace(/\bct\b/g, "court")
    .replace(/\bcr\b/g, "crescent")
    .replace(/\bdr\b/g, "drive")
    .replace(/\bpl\b/g, "place")
    .replace(/\bpn\b/g, "parade")
    .replace(/\s+/g, " ")
    .trim();
}

export function explicitStateFromAddress(address) {
  return String(address || "").match(/\b(VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\b/i)?.[1]?.toUpperCase() || "";
}

export function suburbFromAddress(address) {
  const cleaned = String(address || "").replace(/\b(VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\b|\b\d{4}\b/gi, "");
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    // parts = ["11 McIntosh St", "Oakleigh", "Australia"]
    // 最后一个通常是国家名（"Australia"），倒数第二个才是 suburb
    const candidates = ["australia", "new zealand"];
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!candidates.includes(parts[i].toLowerCase())) {
        return titleCase(parts[i]);
      }
    }
  }
  const normalized = normalizeAddress(cleaned);
  const inlineSuburbMatch = normalized.match(
    /^(?:unit\s+\d+\s+)?(?:\d+\s*\/\s*)?\d+\s+.+?\s+(?:street|avenue|road|grove|drive|court|crescent|parade|place|lane)\s+(.+)$/
  );
  if (inlineSuburbMatch?.[1]) return titleCase(inlineSuburbMatch[1]);
  return "";
}

export function addressSignature(address) {
  const normalized = normalizeAddress(address);
  const slashMatch = normalized.match(/\b(\d+)\s*\/\s*(\d+)\b/);
  const unitMatch = normalized.match(/\bunit\s+(\d+)\b/);
  const apartmentMatch = normalized.match(/\b(?:apartment|apt|flat)\s+([a-z]?\d+[a-z]?)\b/);
  const streetMatch = normalized.match(/\b(\d+)\s+([a-z]+(?:\s+[a-z]+)*)\s+(street|avenue|road|grove|drive|court|crescent|parade|place|lane)\b/);
  return {
    normalized,
    unitNumber: slashMatch?.[1] || apartmentMatch?.[1] || unitMatch?.[1] || "",
    streetNumber: slashMatch?.[2] || streetMatch?.[1] || "",
    streetName: streetMatch ? `${streetMatch[2]} ${streetMatch[3]}` : "",
    hasUnitSignal: /\bunit\b|\bapt\b|\bapartment\b|^\s*[a-zA-Z\d]+\s*\//i.test(String(address || ""))
  };
}

export function normalizePropertyType(type, address) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("commercial")) return "Commercial";
  if (normalized.includes("land")) return "Vacant land";
  if (normalized.includes("townhouse")) return "Townhouse";
  if (normalized.includes("villa")) return "Villa";
  if (normalized.includes("apartment")) return "Apartment";
  if (normalized.includes("unit")) return "Unit";
  if (addressSignature(address).hasUnitSignal) return "Unit";
  return "House";
}

function propertyTypeForPortal(type) {
  if (type === "Apartment" || type === "Unit") return "unit-apartment";
  if (type === "Townhouse") return "townhouse";
  if (type === "Villa") return "villa";
  if (type === "Vacant land") return "land";
  return "house";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatSubjectStreet(address) {
  const signature = addressSignature(address);
  return [signature.streetNumber, signature.streetName].filter(Boolean).join(" ");
}

function makeQuery(parts) {
  return encodeURIComponent(parts.filter(Boolean).join(" "));
}

function buildSearchPlan({ address, suburb, state, propertyType }) {
  const stateLower = state.toLowerCase();
  const subSlug = slugify(suburb);
  const subQuery = makeQuery([suburb, state]);
  const streetQuery = makeQuery([formatSubjectStreet(address), state]);
  const listingUrl = `https://www.realestate.com.au/sold/in-${subSlug}+${stateLower}/list-1`;
  const domainUrl = `https://www.domain.com.au/sold-listings/${subSlug}-${stateLower}/`;
  const domainStateUrl = `https://www.domain.com.au/sold-listings/${subSlug}-${stateLower}/`;
  const propertyTypeFilter = propertyTypeForPortal(propertyType);
  return [
    {
      level: "L0", label: "Subject property profile",
      weight: 100,
      queries: [
        {
          kind: "REA profile",
          source: "realestate.com.au property profile",
          url: `https://www.realestate.com.au/property/${propertyTypeFilter}-${subSlug}-${stateLower}-${subSlug}-${slugify(address)}`,
          fetchable: true
        },
        {
          kind: "Domain profile",
          source: "Domain profile",
          url: `https://www.domain.com.au/${slugify(address)}-${subSlug}-${stateLower}`,
          fetchable: true
        }
      ]
    },
    {
      level: "L1", label: "Same street & same project",
      weight: 95,
      queries: [
        {
          kind: "REA street search",
          source: "realestate.com.au street",
          url: `https://www.realestate.com.au/sold/in-${slugify(formatSubjectStreet(address)).replace(/\s+/g, "-")}+${stateLower}/list-1`,
          fetchable: true
        },
        {
          kind: "Domain keyword street",
          source: "Domain street keyword",
          url: `https://www.domain.com.au/sold-listings/${subSlug}-${stateLower}/?keywords=${encodeURIComponent(formatSubjectStreet(address))}`,
          fetchable: true
        },
        {
          kind: "REA sold suburb list",
          source: "realestate.com.au sold suburb",
          url: listingUrl ? listingUrl.replace("list-1", "") : "",
          fetchable: true
        }
      ]
    },
    {
      level: "L2", label: "Suburb sold results",
      weight: 85,
      queries: [
        {
          kind: "REA sold suburb",
          source: "realestate.com.au sold suburb",
          url: listingUrl,
          fetchable: true
        },
        {
          kind: "Domain sold suburb",
          source: "Domain sold suburb",
          url: domainUrl,
          fetchable: true
        }
      ]
    },
    {
      level: "L3", label: "Domain sold suburb (alt state)",
      weight: 60,
      queries: [
        {
          kind: "Domain sold alt",
          source: "Domain sold suburb alt",
          url: domainStateUrl,
          fetchable: true
        }
      ]
    },
    {
      level: "L4", label: "PriceFinder & Property.com.au",
      weight: 50,
      queries: [
        {
          kind: "PriceFinder suburb",
          source: "PriceFinder suburb",
          url: `https://www.pricefinder.com.au/search?q=${subQuery}`,
          fetchable: false,
          note: "Requires subscription. Listed for manual reference."
        }
      ]
    },
    {
      level: "L5", label: "Suburb demographic context (ABS)",
      weight: 30,
      queries: [
        {
          kind: "ABS quick stats",
          source: "ABS quick stats",
          url: `https://www.abs.gov.au/census/find-census-data/quickstats/2021/${subQuery}`,
          fetchable: false,
          note: "Reference use only; structured data loaded via abs-client.js."
        }
      ]
    },
    {
      level: "L6", label: "Google Maps street check",
      weight: 20,
      queries: [
        {
          kind: "Google Maps link",
          source: "Google Maps",
          url: `https://www.google.com/maps/place/${subQuery}/`,
          fetchable: false,
          note: "Manual or interactive check recommended."
        }
      ]
    },
    {
      level: "L7", label: "Wide area / state summary",
      weight: 10,
      queries: [
        {
          kind: "Property.com.au sold",
          source: "property.com.au sold",
          url: `https://www.property.com.au/sold/${stateLower}/${subSlug}/`,
          fetchable: true
        },
        {
          kind: "Property.com.au suburb",
          source: "property.com.au profile",
          url: `https://www.property.com.au/suburb/${subSlug}-${stateLower}`,
          fetchable: true
        }
      ]
    }
  ];
}

export function formatMoney(amount) {
  if (!Number.isFinite(amount)) return "Unavailable";
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}m`;
  return `$${Math.round(amount / 1000)}k`;
}

function confidenceFromHits(sales, sourceResults) {
  const sources = new Set(sales.map(s => s.source));
  if (sales.length >= 5 && sources.size >= 2) return "Medium-High";
  if (sales.length >= 3 && sources.size >= 1) return "Medium";
  if (sales.length >= 1) return "Low-Medium";
  return "Low";
}

function missingChecksFromResults({ subject, sales }) {
  const missing = [];
  if (!sales.some(s => s.source.includes("domain"))) missing.push("Domain data");
  if (!sales.some(s => s.source.includes("realestate"))) missing.push("REA data");
  if (!sales.length) missing.push("any comparable sales");
  return [...new Set(missing)];
}

async function enrichWithPublicData(suburb, state, address) {
  const result = { ok: false, absProfile: null, rbaRates: null, vicplan: null };
  try {
    const { getSuburbProfile } = await import("./abs-client.js");
    const { getRateEnvironment } = await import("./rba-client.js");
    const { getSuburbGeodata } = await import("./vicplan-client.js");

    const [abs, rba, vicplan] = await Promise.allSettled([
      getSuburbProfile(suburb, state).catch(() => ({ ok: false })),
      getRateEnvironment().catch(() => ({ ok: false })),
      getSuburbGeodata(suburb, state).catch(() => ({ ok: false }))
    ]);
    result.absProfile = abs.status === "fulfilled" ? abs.value : { ok: false };
    const rbaVal = rba.status === "fulfilled" ? rba.value : null;
    result.rbaRates = rbaVal ? { ...rbaVal, ok: true } : { ok: false };
    result.vicplan = vicplan.status === "fulfilled" ? vicplan.value : { ok: false };
  } catch {}
  return result;
}


// ── 地址核验：Nominatim 在线验证 + 坐标 + suburb/邮编确认 ──
const NOMINATIM_DELAY_MS = 1100;  // 1 1/s 免费政策，+100ms 缓冲

export async function verifyAddress(address) {
  // 第一步：正向地理编码
  const q = encodeURIComponent(address.replace(/[,.#]/g, " ").replace(/\s+/g, " ").trim());
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=10&addressdetails=1&countrycodes=au`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
    });
    if (!res.ok) return { ok: false, error: `Nominatim HTTP ${res.status}`, results: [] };
    const data = await res.json();
    if (!data?.length) return { ok: false, error: "Address not found on OpenStreetMap", results: [] };

    const results = data.map(entry => {
      const addr = entry.address || {};
      return {
        lat: parseFloat(entry.lat),
        lon: parseFloat(entry.lon),
        displayName: entry.display_name,
        streetNumber: addr.house_number || "",
        road: addr.road || "",
        suburb: addr.suburb || addr.city_district || addr.town || addr.village || "",
        state: addr.state || "",
        postcode: addr.postcode || "",
        country: addr.country || "",
        boundingbox: entry.boundingbox,
        osmType: entry.osm_type
      };
    });

    // 第二步：如果所有候选都缺 suburb，但有点坐标，做反向地理编码补 suburb
    const anySuburb = results.some(r => r.suburb.length > 0);
    if (!anySuburb && results.length > 0) {
      const first = results[0];
      if (first.lat && first.lon) {
        const revUrl = `https://nominatim.openstreetmap.org/reverse?lat=${first.lat}&lon=${first.lon}&format=json&addressdetails=1`;
        try {
          const revRes = await fetch(revUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
          });
          if (revRes.ok) {
            const revData = await revRes.json();
            const revAddr = revData.address || {};
            const reverseSuburb = revAddr.suburb || revAddr.city_district || revAddr.town || revAddr.village || revAddr.city || "";
            if (reverseSuburb) {
              // 用反向地理编码的结果补到所有候选上
              for (const r of results) {
                if (!r.suburb) r.suburb = reverseSuburb;
              }
            }
          }
        } catch (_) {
          // 反向地理编码失败不影响主流程
        }
      }
    }

    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: err.message, results: [] };
  }
}

export function distanceBetween(lat1, lon1, lat2, lon2) {
  // Haversine 公式
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function buildSubject(input) {
  const enteredAddress = clean(input.address, 300);
  const state = (explicitStateFromAddress(enteredAddress) || clean(input.state, 10) || "VIC").toUpperCase();
  const enteredSuburb = titleCase(clean(input.suburb, 120) || suburbFromAddress(enteredAddress));
  const propertyType = normalizePropertyType(clean(input.propertyType, 80), enteredAddress);
  const signature = addressSignature(enteredAddress);
  let suburb = enteredSuburb;
  let postcode = String(enteredAddress).match(/\b(\d{4})\b/)?.[1] || "";
  const address = enteredAddress;

  // ── 从原始输入提取门牌 + 街道（比较用） ──
  const normalizedInput = normalizeAddress(enteredAddress);
  // 改进的门牌号提取：支持 unit/apt 前缀 + 各种分隔符（/ 或空格）
  let cleanForNum = normalizedInput;
  cleanForNum = cleanForNum.replace(/^(unit|apt|apartment)\s+\d+(?:\s*\/\s*)?\s*/i, "");
  cleanForNum = cleanForNum.replace(/^\d+\s*\/\s*/, "");
  const houseNumMatch = cleanForNum.match(/^(\d+)\s+/);
  const inputHouseNum = houseNumMatch ? houseNumMatch[1] : "";
  // 提取街道名：去掉 unit/apt 后取数字后的街道部分
  let cleanForRoad = normalizedInput;
  cleanForRoad = cleanForRoad.replace(/^(?:unit|apt|apartment)\s+\d+(?:\s*\/\s*)?\s*/i, "");
  cleanForRoad = cleanForRoad.replace(/^\d+\s*\/\s*/, "");
  const roadMatch = cleanForRoad.match(/^\d+\s+(.+?)\s+(?:street|avenue|road|grove|drive|court|crescent|parade|place|lane|pde|rd|st|dr|crt|hwy|tce|wy|bvd|cl|ct|gdn|grn|gr|pkwy|pl|pt|sq|trc|close|circuit|gate|way|rise|view|vale|ridge|highway|motorway)/);
  const inputRoad = roadMatch ? roadMatch[1].trim() : "";

  // ── Nominatim 在线核验 ──
  const verifier = {
    ok: false, status: "pending",
    lat: null, lon: null,
    verifiedSuburb: "", verifiedPostcode: "",
    verifiedRoad: "", verifiedState: "",
    verifiedHouseNum: "",
    canonicalAddress: enteredAddress,
    matchScore: 0,
    roadMatch: false,
    houseNumMatch: false,
  };

  // 地址解析状态
  let addressResolved = false;
  let addressSource = "user_input";
  let addressMismatch = null;
  let mismatchWarnings = [];

  // ═══════════════════════════════════════════════════════════════
  //  地址核验逻辑（Hotfix: Nominatim 辅助核验，不阻断）
  //  规则：
  //  - Nominatim 只作为辅助核验，不是阻断依据
  //  - limit=10 拉取候选集，筛选匹配输入 suburb 的候选
  //  - 存在匹配输入 suburb 的候选 → 用该候选，verified/partial
  //  - 无匹配 suburb 的候选 → 不 mismatch，降级为 unconfirmed
  //  - 仅在同一输入 suburb 内发现明确不同门牌/街道时才 mismatch
  //  - Unit 号未经地图核验 → unitStatus: unverified，可继续估值
  //  - 最终 subject.address = canonicalAddress（用户输入优先）
  // ═══════════════════════════════════════════════════════════════
  try {
    // Strip unit/apt prefix before geocoding: "2/11 mcintosh st" → "11 mcintosh st"
    // Handles:
    //   - "Unit1 11" / "unit 2/11"  (unit prefix, with/without slash/space)
    //   - "2/11"                     (bare unit slash prefix)
    //   - "Apartment 1/11"          (apartment/apt prefix)
    let queryAddress = enteredAddress
      .replace(/^(?:unit|apt|apartment)\s*\d+\s*\/?\s*/i, "")
      .replace(/^\d+\s*\//, "")
      .trim();
    // If strip produced empty string, keep original
    if (!queryAddress) queryAddress = enteredAddress;
    const v = await verifyAddress(queryAddress + " " + state);
    if (v.ok && v.results?.length > 0) {
      const stateMap = { "victoria":"VIC", "new south wales":"NSW", "queensland":"QLD", "western australia":"WA", "south australia":"SA", "tasmania":"TAS", "australian capital territory":"ACT", "northern territory":"NT" };
      const inputSuburbLower = suburb.toLowerCase();

      // 从候选结果中筛选匹配输入 suburb 的候选
      const matchingCandidate = v.results.find(r => {
        const rSuburb = (r.suburb || "").replace(/,.*$/, "").trim().toLowerCase();
        return rSuburb === inputSuburbLower;
      });

      // 判断是否所有候选都缺 suburb 字段（无法判断 suburb 匹配）
      const anySuburbExists = v.results.some(r => {
        const s = (r.suburb || "").replace(/,.*$/, "").trim();
        return s.length > 0;
      });

      // 匹配候选存在 → 用匹配候选；否则用 top result 作参考但不阻断
      const bestResult = matchingCandidate || v.results[0];

      const vSuburb = (bestResult.suburb || "").replace(/,.*$/, "").trim();
      const vRoad = clean(bestResult.road || "");
      const vHouseNum = clean(bestResult.streetNumber || "");

      verifier.ok = true;
      verifier.lat = bestResult.lat;
      verifier.lon = bestResult.lon;
      verifier.verifiedSuburb = titleCase(vSuburb);
      verifier.verifiedPostcode = bestResult.postcode || "";
      verifier.verifiedRoad = titleCase(vRoad);
      verifier.verifiedHouseNum = vHouseNum;
      verifier.verifiedState = stateMap[(bestResult.state || "").toLowerCase()] || bestResult.state || "";

      // Unit 检测
      const hasUnitInput = /^(unit|apt|apartment)\s+\d+|^\d+\s*\//i.test(enteredAddress.trim());
      const unitStatus = hasUnitInput ? "unverified" : "none";
      verifier.unitStatus = unitStatus;

      // Suburb 匹配
      const suburbExact = Boolean(vSuburb) && titleCase(vSuburb).toLowerCase() === inputSuburbLower;
      verifier.suburbExact = suburbExact;
      const suburbExists = Boolean(vSuburb);

      // State 匹配
      const stateAbbrev = stateMap[(state || "").toLowerCase()] || state;
      const stateMatch = Boolean(verifier.verifiedState && stateAbbrev && verifier.verifiedState === stateAbbrev);
      verifier.stateMatch = stateMatch;
      const stateExists = Boolean(verifier.verifiedState);

      // 门牌号匹配（支持 5-7 范围门牌号）
      const houseNumConfirmed = Boolean(vHouseNum && inputHouseNum);
      const houseNumMatch = houseNumConfirmed && (() => {
        if (vHouseNum === inputHouseNum) return true;
        // 范围门牌号：地图返回 "5-7"，用户输入 "5" 或 "7" 都算匹配
        const rangeMatch = vHouseNum.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
          const [,start,end] = rangeMatch;
          const inputNum = parseInt(inputHouseNum, 10);
          return inputNum >= parseInt(start,10) && inputNum <= parseInt(end,10);
        }
        return false;
      })();
      verifier.houseNumMatch = houseNumMatch;

      // 街道名匹配
      const roadConfirmed = Boolean(vRoad && inputRoad);
      const roadMatch = roadConfirmed &&
        normalizeAddress(vRoad).toLowerCase().includes(normalizeAddress(inputRoad).toLowerCase());
      verifier.roadMatch = roadMatch;

      // 字段缺失
      const unconfirmedFields = [];
      if (!vSuburb) unconfirmedFields.push("suburb");
      if (!verifier.verifiedState) unconfirmedFields.push("state");
      if (!vHouseNum) unconfirmedFields.push("house_number");
      if (!vRoad) unconfirmedFields.push("road");
      verifier.unconfirmedFields = unconfirmedFields;

      // ── 逻辑判断 ──
      // 场景 A: 存在匹配输入 suburb 的候选
      if (matchingCandidate) {
        // 在匹配 suburb 内检查街道/门牌冲突
        const mismatchFields = [];
        if (stateExists && !stateMatch) mismatchFields.push("state");
        if (houseNumConfirmed && !houseNumMatch) mismatchFields.push("house_number");
        if (roadConfirmed && !roadMatch) mismatchFields.push("road");

        if (mismatchFields.length === 0) {
          verifier.status = unconfirmedFields.length === 0 ? "verified" : "partial";
          verifier.addressConfidence = unconfirmedFields.length === 0 ? "high" : "medium";
          addressResolved = true;
          addressSource = "nominatim_verified";
          suburb = titleCase(vSuburb) || suburb;
          postcode = bestResult.postcode || postcode;

          const parts = [];
          const unitPrefix = hasUnitInput
            ? (enteredAddress.match(/^(?:unit\s+)?\d+(?=\s*\/)/i)?.[0] || "")
            : "";
          // unitPrefix = "2", join as "2/11" or "unit 2/11"
          const unitSlash = unitPrefix ? unitPrefix + "/" : "";
          if (vRoad && vHouseNum) {
            // Nominatim returned both street + number — use verified values with unit prefix
            parts.push(unitSlash + vHouseNum + " " + titleCase(vRoad));
          } else if (vRoad) {
            // Nominatim returned street but no house number (e.g. "2/11" confuses parser)
            // Use original address's unit prefix + street number + verified road
            const streetNum = addressSignature(enteredAddress).streetNumber || "";
            parts.push(unitSlash + streetNum + " " + titleCase(vRoad));
          } else {
            // Fallback: just clean original address
            const cleanStreet = formatSubjectStreet(enteredAddress);
            parts.push(cleanStreet);
          }
          parts.push(suburb);
          parts.push(verifier.verifiedState || state);
          if (postcode) parts.push(postcode);
          verifier.canonicalAddress = parts.join(", ");
        } else {
          // 同一 suburb 内街道/门牌冲突 → mismatch
          verifier.status = "mismatch";
          verifier.addressConfidence = "none";
          addressResolved = false;
          const failures = [];
          if (mismatchFields.includes("house_number")) failures.push(`门牌号: 输入 "${inputHouseNum}" 与地图 "${vHouseNum}" 不一致`);
          if (mismatchFields.includes("road")) failures.push(`街道: 输入 "${inputRoad}" 未匹配地图 "${titleCase(vRoad)}"`);
          if (mismatchFields.includes("state")) failures.push(`state: 输入 "${state}" 与地图 "${verifier.verifiedState}" 不一致`);
          const failSummary = failures.join("；");
          addressMismatch = { type:"comprehensive", inputSuburb:suburb, verifiedSuburb:titleCase(vSuburb), inputState:stateAbbrev, verifiedState:verifier.verifiedState, inputHouseNum, verifiedHouseNum:vHouseNum, inputRoad, verifiedRoad:titleCase(vRoad), failures, mismatchFields, unconfirmedFields, message:`地址核验不通过：${failSummary}` };
          mismatchWarnings.push(addressMismatch.message);
        }
      } else if (!anySuburbExists) {
        // 场景 B1: 所有候选都缺 suburb 字段（地图数据不足）
        // 降级为 partial，不阻断，使用客户输入
        // unconfirmedFields 已在前面代码中添加了 suburb 缺失
        verifier.status = "partial";
        verifier.addressConfidence = "medium";
        addressResolved = true;
        addressSource = "nominatim_verified";
        verifier.unconfirmedFields = unconfirmedFields;
      } else {
        // 场景 B2: 候选 suburb 存在但都不匹配输入 suburb
        // 不阻断，使用客户输入继续估值，降低置信度
        verifier.status = "unconfirmed";
        verifier.addressConfidence = "low";
        addressResolved = true;
        addressSource = "user_input_fallback";
        // 如果客户没有输入 suburb 但 Nominatim 识别出了，用 verifiedSuburb
        if (!enteredSuburb && vSuburb) {
          suburb = titleCase(vSuburb);
        }
        verifier.nominatimHint = {
          topResultSuburb: titleCase(vSuburb),
          message: `注：地图查询结果主要在 ${titleCase(vSuburb)}，与输入 "${suburb}" 不一致，已采用客户输入继续估值`
        };
        mismatchWarnings.push(verifier.nominatimHint.message);
      }
    } else {
      // Nominatim 不可用或未找到
      verifier.status = "unavailable";
      verifier.addressConfidence = "low";
      verifier.error = v.error || "Nominatim returned no results";
      addressResolved = true;
      addressSource = "user_input_fallback";
    }
  } catch (e) {
    verifier.status = "unavailable";
    verifier.addressConfidence = "low";
    verifier.error = e.message;
    addressResolved = true;
    addressSource = "user_input_fallback";
  }

  // SA2 代码
  const sa2Code = "";

  // ── effectiveAddress：最终 subject.address = canonicalAddress ──
  const effectiveAddress = verifier.canonicalAddress || address;

  const result = {
    address: effectiveAddress,
    canonicalAddress: effectiveAddress,
    enteredAddress,
    suburb,
    enteredSuburb,
    state,
    postcode,
    sa2Code,
    council: "",
    localityEvidence: verifier.status === "verified" || verifier.status === "partial"
      ? [{ source: "nominatim", status: verifier.status, lat: verifier.lat, lon: verifier.lon }]
      : [],
    propertyType,
    signature,
    coordinates: verifier.lat ? { lat: verifier.lat, lon: verifier.lon } : null,
    localityStatus: verifier.status,
    verification: verifier,
    valid: Boolean(address && STATE_NAMES.includes(state)),
    addressResolved,
    addressSource,
    addressMismatch,
    mismatchWarnings
  };

  return result;
}
function salesAsSignals(sales, sourceUrl) {
  return sales.map((s, i) => ({
    index: i,
    source: s.source,
    sourceUrl: sourceUrl || s.sourceUrl,
    address: s.address,
    price: s.price,
    priceText: formatMoney(s.price),
    propertyType: s.propertyType,
    bedrooms: s.bedrooms,
    bathrooms: s.bathrooms,
    carSpaces: s.carSpaces,
    landSize: s.landSize,
    saleDate: s.saleDate,
    text: `Sold $${s.price.toLocaleString()} at ${s.address}`,
    url: sourceUrl || s.sourceUrl,
    extractedBy: "browser"
  }));
}

// ════════════════════════════════════════════
// 主入口：替换 Codex 的 fetchWithTimeout → CDP 浏览器抓取
// ════════════════════════════════════════════

export async function collectComparableResearch(input, options = {}) {
  const subject = await buildSubject(input);
  if (!subject.valid) {
    return {
      ok: false,
      error: "Valid address and Australian state are required",
      subject
    };
  }

  const plan = buildSearchPlan(subject);
  const sourceResults = [];
  let browserSales = [];

  if (options.fetch !== false) {
    try {
      // ── 从 browser-collector 用真实 Chrome 抓取 REA + Domain ──
      // 本地开发用 CDP (127.0.0.1:18800)。Vercel 环境应传 { fetch: false }
      const postcode = subject.postcode || undefined;
      browserSales = await scrapeSoldData(subject.suburb, subject.state, postcode);
    } catch (err) {
      // browser 抓取失败时降级
    }
  }

  // ── 构建 sourceResults 兼容旧格式 ──
  // REA + Domain 成功则标记为 fetched
  if (browserSales.length > 0) {
    const reaCount = browserSales.filter(s => s.source.includes("realestate")).length;
    const domainCount = browserSales.filter(s => s.source.includes("domain")).length;

    // 构建每个搜索计划的源结果
    for (const step of plan) {
      for (const query of step.queries) {
        const matched = query.source.includes("realestate") || query.source.includes("Domain sold");
        const isReaMatch = query.source.includes("realestate") && reaCount > 0;
        const isDomainMatch = query.source.includes("Domain") && domainCount > 0;

        if (matched) {
          const signals = salesAsSignals(browserSales, query.url);
          sourceResults.push({
            level: step.level,
            levelLabel: step.label,
            source: query.source,
            kind: query.kind,
            url: query.url,
            fetchable: query.fetchable !== false,
            status: "fetched",
            httpStatus: 200,
            signals: signals.filter(s => {
              if (query.source.includes("realestate") && !s.source.includes("realestate")) return false;
              if (query.source.includes("Domain") && !s.source.includes("domain")) return false;
              return true;
            })
          });
        } else if (query.fetchable) {
          sourceResults.push({
            level: step.level,
            levelLabel: step.label,
            source: query.source,
            kind: query.kind,
            url: query.url,
            fetchable: true,
            status: "unavailable",
            httpStatus: null,
            error: null,
            signals: []
          });
        } else {
          sourceResults.push({
            level: step.level,
            levelLabel: step.label,
            source: query.source,
            kind: query.kind,
            url: query.url,
            fetchable: false,
            status: "link-only",
            signals: []
          });
        }
      }
    }
  } else {
    // 无任何数据时标记全部为 unavailable
    for (const step of plan) {
      for (const query of step.queries) {
        sourceResults.push({
          level: step.level,
          levelLabel: step.label,
          source: query.source,
          kind: query.kind,
          url: query.url,
          fetchable: query.fetchable !== false,
          status: query.fetchable ? "unavailable" : "link-only",
          httpStatus: null,
          error: "No browser data available",
          signals: []
        });
      }
    }
  }

  const allSignals = sourceResults.flatMap(r => r.signals);
  const researchConfidence = confidenceFromHits(browserSales, sourceResults);
  const salesAsComparables = options.useComparables !== false
    ? formatAsComparables(browserSales, subject)
    : [];

  const estimate = {
    status: browserSales.length > 0 ? "requires-structured-comparables" : "no-data",
    value: browserSales.length > 0
      ? "Real-time comparable data collected; send to valuation-engine.js for formal estimate"
      : "No price data could be collected from any source",
    midpoint: browserSales.length > 0
      ? formatMoney(browserSales.reduce((s, x) => s + x.price, 0) / browserSales.length)
      : "Unavailable",
    midpointValue: browserSales.length > 0
      ? Math.round(browserSales.reduce((s, x) => s + x.price, 0) / browserSales.length)
      : null,
    confidence: researchConfidence,
    comparableCount: browserSales.length
  };

  const publicData = await enrichWithPublicData(subject.suburb, subject.state, subject.address);

  // ── 用 ABS API 返回的真实 SA2 code 覆盖 subject.sa2Code ──
  const absProfile = publicData.absProfile;
  if (absProfile && absProfile.ok && absProfile.sa2Code) {
    subject.sa2Code = absProfile.sa2Code;
  }
  // ABS 查询失败时 subject.sa2Code 保持空字符串

  return {
    ok: true,
    collectedAt: new Date().toISOString(),
    mode: "live-browser-research",
    subject,
    searchPlan: plan.map(({ ...step }) => step),
    sourceResults: sourceResults.map(({ signals: _s, ...r }) => r),
    priceSignals: allSignals.slice(0, 30),
    // ── 新增：直接可用于 valuation-engine.js 的 comparables ──
    comparables: salesAsComparables,
    estimate,
    sourceScore: Math.min(100, browserSales.length * 3),
    confidence: researchConfidence,
    missingChecks: missingChecksFromResults({ subject, sales: browserSales }),
    rules: [
      "No source URL, no formal comparable.",
      "No verified sold price, no price anchor.",
      "If same-street evidence is insufficient, expand radius and lower confidence.",
      "Suburb median or area average is a low-confidence fallback only.",
      "Data collected via OpenClaw browser tool (real Chrome, bypasses anti-bot)."
    ],
    absProfile: publicData.absProfile || null,
    rbaRates: publicData.rbaRates || null,
    vicplan: publicData.vicplan || null
  };
}

// ── 保留旧版 fetchWithTimeout 接口（安全降级，不抛出） ──
export async function fetchWithTimeout(url, opts = {}) {
  // 不再使用纯 Node fetch（全部 403/429）
  // 通过 browser-collector 走真实浏览器
  const { fetchPageText } = await import("./browser-collector.js");
  const result = await fetchPageText(url);
  return result.ok
    ? { ok: true, status: 200, text: result.text }
    : { ok: false, status: 0, text: "", error: result.error || "browser fetch failed" };
}

// ── 保留旧版 extractPriceSignals、parsePrice（供外部兼容） ──
export function extractPriceSignals(html, query, planStep) {
  return [];
}

export function parsePrice(text) {
  const amountMatch = String(text || "").match(/\$[\d,]+(?:\.\d+)?\s*([mk]?)/i);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[0].replace(/[$,]/g, ""));
  const unit = amountMatch[1]?.toLowerCase() || "";
  if (!Number.isFinite(amount)) return null;
  if (unit === "m" || unit === "million") return Math.round(amount * 1000000);
  if (unit === "k") return Math.round(amount * 1000);
  return amount > 10000 ? Math.round(amount) : null;
}

// ── 保留旧版 decodeHtml ──
function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

export default { collectComparableResearch, buildSubject, buildSearchPlan, normalizeAddress, addressSignature, normalizePropertyType, formatMoney, verifyAddress, distanceBetween };
