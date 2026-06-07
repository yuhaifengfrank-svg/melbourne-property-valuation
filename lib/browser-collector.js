// ── 浏览器抓取模块（OpenClaw CDP 直连版） ──
// 通过 CDP WebSocket 控制真实 Chrome 抓取公开成交记录
// 本地开发用。Vercel 环境不得使用此模块。
// 遵守 VALUATION_SOURCE_POLICY.md 来源政策

import WebSocket from "ws";

const CDP_HOST = "127.0.0.1:18800";

/**
 * 使用 CDP WebSocket 抓取页面文本内容
 * @param {string} url - 完整页面 URL
 * @param {number} [waitMs=5000] - 等待页面加载的最长时间(ms)
 * @returns {Promise<{ok:boolean, text:string, error?:string}>}
 */
export async function fetchPageText(url, waitMs = 8000) {
  const tab = await cdpNewTab();
  if (!tab) return { ok: false, text: "", error: "CDP: cannot create tab" };
  const targetId = tab.id || tab.targetId;
  const wsUrl = `ws://${CDP_HOST}/devtools/page/${targetId}`;

  return new Promise(resolve => {
    let done = false;
    const ws = new WebSocket(wsUrl);
    let mid = 1;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        cdpCloseTab(targetId).catch(() => {});
        ws.close();
        resolve({ ok: false, text: "", error: "CDP: timeout" });
      }
    }, waitMs + 5000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ id: mid++, method: "Page.enable" }));
      ws.send(JSON.stringify({ id: mid++, method: "Page.navigate", params: { url } }));
      const evalId = mid++;

      let loadTimer = setTimeout(() => {
        ws.send(JSON.stringify({ id: evalId, method: "Runtime.evaluate",
          params: { expression: "document.documentElement.innerText" } }));
      }, waitMs);

      ws.on("message", data => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.method === "Page.frameStoppedLoading" && !done) {
            clearTimeout(loadTimer);
            setTimeout(() => {
              if (!done) ws.send(JSON.stringify({ id: evalId, method: "Runtime.evaluate",
                params: { expression: "document.documentElement.innerText" } }));
            }, 2000);
          }
          if (msg.id === evalId && msg.result?.result?.value !== undefined && !done) {
            done = true; clearTimeout(timer);
            const text = msg.result.result.value;
            cdpCloseTab(targetId).catch(() => {});
            ws.close();
            resolve({ ok: true, text });
          }
        } catch {}
      });
    });
    ws.on("error", () => {
      if (!done) { done = true; clearTimeout(timer);
        cdpCloseTab(targetId).catch(() => {});
        resolve({ ok: false, text: "", error: "CDP: WS error" }); }
    });
  });
}

// ── CDP HTTP API 辅助 ──

async function cdpNewTab() {
  try {
    const r = await fetch(`http://${CDP_HOST}/json/new`, { method: "PUT" });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function cdpCloseTab(targetId) {
  try { await fetch(`http://${CDP_HOST}/json/close/${targetId}`); } catch {}
}

// ── 页面解析器 ──

/**
 * 从 REA sold 页面文本提取成交记录
 */
export function parseReaSold(text, suburb) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const sales = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "Sold" && i + 1 < lines.length && lines[i + 1].startsWith("$")) {
      const price = parseInt(lines[i + 1].replace(/[$,]/g, ""));
      let address = "";
      for (let k = 0; k < 5 && i + 2 + k < lines.length; k++) {
        const l = lines[i + 2 + k];
        if (l.includes(suburb) || (suburb.split(" ").every(w => l.includes(w)))) {
          address = l; break;
        }
      }
      if (!address) continue;

      const s = {
        address, price, propertyType: "House",
        bedrooms: null, bathrooms: null, carSpaces: null,
        landSize: null, saleDate: null, source: "realestate.com.au",
        sourceUrl: ""
      };
      for (let j = 0; i + 3 + j < lines.length; j++) {
        const l = lines[i + 3 + j];
        if (l.startsWith("$")) break;
        if (l === "Sold" || (l.startsWith("Sold") && !l.startsWith("Sold on"))) break;
        if (/^\d+$/.test(l) && s.bedrooms === null) s.bedrooms = parseInt(l);
        else if (l.includes("m²")) s.landSize = parseInt(l.replace(/[^0-9]/g, ""));
        else if (/^(House|Townhouse|Apartment|Unit|Villa|Land)$/i.test(l)) s.propertyType = l;
        if (l.startsWith("Sold on")) s.saleDate = l.replace("Sold on ", "").trim();
      }
      sales.push(s);
    }
  }
  return sales;
}

/**
 * 从 Domain sold 页面文本提取成交记录
 */
/**
 * 从地址推断物业类型
 * 带 unit/flat/apt 前缀 → Unit/Apartment
 * 否则保持原值
 */
function inferPropertyType(address, defaultType = 'House') {
  const addr = address.toLowerCase();
  if (/\b(?:unit|flat)\s+\d/i.test(addr) || /^\d+\s*\//.test(addr)) {
    // 地址有 unit/flat 号 → Unit
    return 'Unit';
  }
  if (/\b(?:apartment|apt)\s+\d/i.test(addr)) {
    return 'Apartment';
  }
  if (/\btown(?:house)?\b/i.test(addr)) {
    return 'Townhouse';
  }
  if (/\bvilla\b/i.test(addr)) {
    return 'Villa';
  }
  if (/\bland\b/i.test(addr) || /vacant/i.test(addr)) {
    return 'Vacant land';
  }
  return defaultType;
}

export function parseDomainSold(text, suburb) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const sales = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("$") && /^[\d,]+$/.test(lines[i].slice(1))) {
      const price = parseInt(lines[i].replace(/[$,]/g, ""));
      if (price < 50000 || price > 50000000) continue;
      if (i + 1 >= lines.length) continue;
      const address = lines[i + 1].trim();
      if (!address.includes(suburb)) continue;

      const s = {
        address, price, propertyType: inferPropertyType(address),
        bedrooms: null, bathrooms: null, carSpaces: null,
        landSize: null, saleDate: null, source: "domain.com.au",
        sourceUrl: ""
      };
      if (i + 2 < lines.length && /^\d+$/.test(lines[i + 2])) s.bedrooms = parseInt(lines[i + 2]);
      if (i + 3 < lines.length && /^\d+$/.test(lines[i + 3])) s.bathrooms = parseInt(lines[i + 3]);
      if (i + 4 < lines.length && /^\d+$/.test(lines[i + 4])) s.carSpaces = parseInt(lines[i + 4]);
      for (let k = 0; k < 6; k++) {
        const l = lines[i + 5 + k];
        if (l && l.includes("m²")) { s.landSize = parseInt(l.replace(/[^0-9]/g, "")); break; }
      }
      // Domain 的物业类型可能在列表项标题内，略过，由外部根据地址判断
      sales.push(s);
    }
  }
  return sales;
}

/**
 * 合并去重
 */
export function deduplicate(sales) {
  // 标准化地址用于比较
  function norm(addr) {
    return addr.toLowerCase().replace(/[\s,.-]+/g, " ").replace(/\u00a0/g, " ").trim();
  }
  const map = new Map();
  for (const s of sales) {
    const key = `${norm(s.address)}|${s.price}`;
    if (!map.has(key)) {
      map.set(key, { ...s });
    } else {
      const e = map.get(key);
      e.source = [e.source, s.source].filter(Boolean).join("+");
      // 保留更好的 address 格式
      if (s.address.trim().length > e.address.trim().length) e.address = s.address;
    }
  }
  return Array.from(map.values());
}

/**
 * 抓取并解析 REA + Domain，返回合并的唯一成交列表
 * @param {string} suburb - 例如 "Oakleigh South"
 * @param {string} state - 例如 "VIC"
 * @param {string} [postcode] - 可选，Domain 需要
 * @returns {Promise<Array>} 合并去重的成交记录
 */
export async function scrapeSoldData(suburb, state, postcode) {
  const subSlug = suburb.toLowerCase().replace(/\s+/g, "-");
  const stateLower = state.toLowerCase();

  const results = await Promise.allSettled([
    fetchPageText(
      `https://www.realestate.com.au/sold/in-${subSlug}+${stateLower}/list-1`
    ),
    fetchPageText(
      postcode
        ? `https://www.domain.com.au/sold-listings/${subSlug}-${stateLower}-${postcode}/`
        : `https://www.domain.com.au/sold-listings/${subSlug}-${stateLower}/`
    )
  ]);

  const allSales = [];

  if (results[0].status === "fulfilled" && results[0].value.ok) {
    const reaSales = parseReaSold(results[0].value.text, suburb);
    reaSales.forEach(s => {
      s.sourceUrl = `https://www.realestate.com.au/sold/in-${subSlug}+${stateLower}/list-1`;
    });
    allSales.push(...reaSales);
  }

  if (results[1].status === "fulfilled" && results[1].value.ok) {
    const domainSales = parseDomainSold(results[1].value.text, suburb);
    domainSales.forEach(s => {
      s.sourceUrl = postcode
        ? `https://www.domain.com.au/sold-listings/${subSlug}-${stateLower}-${postcode}/`
        : `https://www.domain.com.au/sold-listings/${subSlug}-${stateLower}/`;
    });
    allSales.push(...domainSales);
  }

  return deduplicate(allSales);
}

/**
 * 把浏览器抓取的 sales 格式化为引擎需要的 comparable 格式
 */
export function formatAsComparables(sales, subject) {
  // 先过滤无效价格，然后去重（同地址同价格只保留一个）
  function norm(addr) {
    return addr.toLowerCase().replace(/[\s,.-]+/g, " ").replace(/\u00a0/g, " ").trim();
  }
  const seen = new Set();
  const deduped = [];
  for (const s of sales) {
    if (s.price < 50000) continue;
    const key = `${norm(s.address)}|${s.price}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(s);
    } else {
      const existing = deduped.find(x => norm(x.address) === norm(s.address) && x.price === s.price);
      if (existing) existing.source = [existing.source, s.source].filter(Boolean).join("+");
    }
  }

  return deduped
    .slice(0, 12)
    .map((s) => {
      // ── streetQualityScore 地址后缀规则 ──
      const streetSuffixScore = (() => {
        const addr = (s.address || '').toLowerCase();
        if (/\b(close|place|court|way|loop|circuit|parade|garden|grove|green|view|vista|ridge|crest|heights|chase|vale|meadow|park)$/.test(addr)) return 5;
        if (/\b(avenue|ave|crescent|cres|drive|dr|terrace|terr|walk|lane|rise|gate|glen|dell|bend|nook|lea|field|brook|dene|side)$/.test(addr)) return 4;
        if (/\b(street|st|road|way|broadway)$/.test(addr)) return 3;
        if (/\b(highway|hwy|motorway|freeway|expressway|by-pass|bypass)$/.test(addr)) return 2;
        return 3;
      })();

      return {
        address: s.address,
        streetQualityScore: streetSuffixScore,
        propertyType: s.propertyType && (s.propertyType !== 'House' || inferPropertyType(s.address, s.propertyType) === s.propertyType) ? s.propertyType : inferPropertyType(s.address, s.propertyType || 'House'),
        salePrice: s.price,
        saleDate: s.saleDate || null,
        distanceMeters: s.distanceMeters || null,
        bedrooms: s.bedrooms || null,
        bathrooms: s.bathrooms || null,
        carSpaces: s.carSpaces || null,
        landSize: s.landSize || null,
        sourceUrl: s.sourceUrl || null,
        sourceCount: s.source ? (s.source.includes('+') ? 2 : 1) : 0,
        conditionScore: s.conditionScore || null,
        microLocationScore: s.microLocationScore || null,
        planningScore: s.planningScore || null,
        riskScore: s.riskScore || null,
        bodyCorporateScore: s.bodyCorporateScore || null,
        buildingPositionScore: s.buildingPositionScore || null,
        viewScore: s.viewScore || null,
        floorLevel: s.floorLevel || null
      };
    });
}

export default { fetchPageText, scrapeSoldData, parseReaSold, parseDomainSold, deduplicate, formatAsComparables };
