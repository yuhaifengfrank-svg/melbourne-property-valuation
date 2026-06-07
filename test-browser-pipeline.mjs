import { valueProperty } from "./lib/valuation-engine.js";
import WebSocket from "ws";
import { get } from "http";

const CDP = "127.0.0.1:18800";

function closeTab(id) {
  return new Promise(r => get(`http://${CDP}/json/close/${id}`, () => r()).on("error", () => r()));
}

async function getPageText(url, timeoutMs = 12000) {
  const r = await fetch(`http://${CDP}/json/new`, { method: "PUT" });
  if (!r.ok) throw "CDP new tab fail: " + r.status;
  const tab = await r.json();
  const tid = tab.id || tab.targetId;
  const wsu = `ws://${CDP}/devtools/page/${tid}`;

  return new Promise(resolve => {
    const ws = new WebSocket(wsu);
    let mid = 1, done = false;
    const t = setTimeout(() => { if (!done) { done = true; closeTab(tid); ws.close(); resolve({ ok: false, text: "", error: "Timeout" }); } }, timeoutMs);

    ws.on("open", () => {
      ws.send(JSON.stringify({ id: mid++, method: "Page.enable" }));
      ws.send(JSON.stringify({ id: mid++, method: "Page.navigate", params: { url } }));
      const eid = mid++;

      let lt = setTimeout(() => ws.send(JSON.stringify({ id: eid, method: "Runtime.evaluate", params: { expression: "document.documentElement.innerText" } })), 5000);

      ws.on("message", d => {
        try {
          const m = JSON.parse(d.toString());
          if (m.method === "Page.frameStoppedLoading") { clearTimeout(lt);
            setTimeout(() => ws.send(JSON.stringify({ id: eid, method: "Runtime.evaluate", params: { expression: "document.documentElement.innerText" } })), 1500); }
          if (m.id === eid && m.result?.result?.value !== undefined) {
            clearTimeout(t); if (!done) { done = true; const tx = m.result.result.value; closeTab(tid); ws.close(); resolve({ ok: true, text: tx }); }
          }
        } catch {}
      });
    });
    ws.on("error", () => { if (!done) { done = true; closeTab(tid); clearTimeout(t); resolve({ ok: false, text: "", error: "WS err" }); } });
  });
}

function parseRea(text, suburb) {
  const L = text.split("\n").map(l => l.trim()).filter(Boolean), out = [];
  for (let i = 0; i < L.length; i++) {
    if (L[i] === "Sold" && i + 1 < L.length && L[i+1].startsWith("$")) {
      const p = parseInt(L[i+1].replace(/[$,]/g, ""));
      let addr = "";
      for (let k = 0; k < 5 && i+2+k < L.length; k++) { if (L[i+2+k].includes(suburb)) { addr = L[i+2+k]; break; } }
      if (!addr) continue;
      const s = { address: addr, price: p, bd: null, ba: null, ca: null, land: null, type: "House", src: "realestate.com.au" };
      for (let j = 0; i+3+j < L.length; j++) {
        const l = L[i+3+j];
        if (l.includes("Sold on") || l === "Sold" || l.startsWith("$")) break;
        if (/^\d+$/.test(l) && s.bd === null) s.bd = parseInt(l);
        else if (l.includes("m²")) s.land = parseInt(l.replace(/[^0-9]/g, ""));
        else if (/^(House|Townhouse|Apartment|Unit|Villa|Land)$/i.test(l)) s.type = l;
      }
      out.push(s);
    }
  }
  return out;
}

function parseDomain(text, suburb) {
  const L = text.split("\n").map(l => l.trim()).filter(Boolean), out = [];
  for (let i = 0; i < L.length; i++) {
    if (/^\$[\d,]+$/.test(L[i]) && parseInt(L[i].replace(/[$,]/g,"")) > 50000) {
      const p = parseInt(L[i].replace(/[$,]/g,""));
      if (i+1 >= L.length || !L[i+1].includes(suburb)) continue;
      const s = { address: L[i+1].trim(), price: p, bd: null, ba: null, ca: null, land: null, type: "House", src: "domain.com.au" };
      if (i+2 < L.length && /^\d+$/.test(L[i+2])) s.bd = parseInt(L[i+2]);
      if (i+3 < L.length && /^\d+$/.test(L[i+3])) s.ba = parseInt(L[i+3]);
      if (i+4 < L.length && /^\d+$/.test(L[i+4])) s.ca = parseInt(L[i+4]);
      for (let k = 0; k < 6; k++) { if (L[i+5+k]?.includes("m²")) { s.land = parseInt(L[i+5+k].replace(/[^0-9]/g,"")); break; } }
      out.push(s);
    }
  }
  return out;
}

// ════ RUN ════
const sub = "Oakleigh South", st = "VIC";
const addr = "11 McIntosh Street, Oakleigh South VIC 3167";

console.log("\n── 1. REA ──");
const ra = await getPageText(`https://www.realestate.com.au/sold/in-oakleigh+south+vic/list-1`);
const rl = ra.ok ? parseRea(ra.text, sub) : [];
console.log(`${ra.ok ? "OK" : "FAIL"}: ${rl.length} sales`);
rl.slice(0,4).forEach(s => console.log(`  ${s.address} → $${(s.price/1000).toFixed(0)}k  ${s.bd||"-"}/${s.ba||"-"}/${s.ca||"-"} ${s.land||"-"}m² ${s.type}`));

console.log("\n── 2. Domain ──");
const da = await getPageText(`https://www.domain.com.au/sold-listings/oakleigh-south-vic-3167/`);
const dl = da.ok ? parseDomain(da.text, sub) : [];
console.log(`${da.ok ? "OK" : "FAIL"}: ${dl.length} sales`);
dl.slice(0,4).forEach(s => console.log(`  ${s.address} → $${(s.price/1000).toFixed(0)}k  ${s.bd||"-"}/${s.ba||"-"}/${s.ca||"-"} ${s.land||"-"}m²`));

console.log("\n── 3. Merge ──");
const kv = new Map();
[...rl, ...dl].forEach(s => { const k = `${s.address}|${s.price}`; if (!kv.has(k)) kv.set(k,s); else kv.get(k).src += "+" + s.src; });
const all = [...kv.values()];
console.log(`Unique: ${all.length} (${rl.length}+${dl.length})`);

console.log("\n── 4. Valuation ──");
const picks = all.filter(s => s.price > 200000).sort((a,b) => Math.abs(a.price-1000000)-Math.abs(b.price-1000000)).slice(0,5);
if (picks.length >= 2) {
  const v = valueProperty({
    subject: { address: addr, propertyType: "House", bedrooms: 3, bathrooms: 2, carSpaces: 1, landSize: 500, conditionScore: 3, microLocationScore: 3 },
    comparables: picks.map((s, i) => ({
      address: s.address, propertyType: "House", salePrice: s.price, saleDate: "2026-06-01",
      distanceMeters: 500 + i * 250, bedrooms: s.bd || 3, bathrooms: s.ba || 2, carSpaces: s.ca || 2,
      landSize: s.land || 500, sourceUrl: `https://${s.src}/sold/${i}`, sourceCount: 2,
      conditionScore: 3, microLocationScore: 3, streetQualityScore: 3, planningScore: 3, riskScore: 2
    }))
  });
  if (v.ok && v.estimate) {
    console.log(`Midpoint: $${(v.estimate.midpoint/1000).toFixed(0)}k`);
    console.log(`Range:    $${(v.estimate.low/1000).toFixed(0)}k - $${(v.estimate.high/1000).toFixed(0)}k`);
    console.log(`Conf:    ${v.confidence.label} (${v.confidence.dataScore}/100)`);
    console.log(`σ:       ${(v.statisticalIntervals?.sigma * 100).toFixed(1)}%`);
    console.log(`Accept:  ${v.acceptedComparables.length}, Reject: ${v.rejectedComparables.length}`);
    v.acceptedComparables.forEach(c => console.log(`  [${c.qualityBand}] ${c.address} → $${(c.salePrice/1000).toFixed(0)}k (${c.qualityScore})`));
  } else console.log("Valuation fail:", v.status);
} else console.log("Not enough candidates");

console.log("\n── DONE ──");
