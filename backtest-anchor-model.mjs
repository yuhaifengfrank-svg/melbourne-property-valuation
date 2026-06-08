import { getSql } from "./api/_db.js";
import { valueProperty } from "./lib/valuation-engine.js";

function cleanType(pt, spt, addr) {
  const a = (addr || "").toLowerCase();
  if (a.startsWith("lot ") || a.startsWith("lot,")) return "Vacant land";
  const p = (pt || "").toLowerCase(), sp = (spt || "").toLowerCase();
  if (p === "unit" && sp.includes("town")) return "Townhouse";
  if (p === "unit" && sp.includes("villa")) return "Villa";
  if (p === "unit") return "Unit";
  if (p === "house") return "House";
  if (p === "townhouse") return "Townhouse";
  if (p === "villa") return "Villa";
  if (p === "apartment") return "Apartment";
  if (p.includes("vacant") || p === "land") return "Vacant land";
  return "House";
}

function isVacant(addr) {
  return (addr || "").toLowerCase().startsWith("lot ");
}

function compTypeGroup(pt) {
  const t = cleanType(pt, "", "");
  if (t === "House") return "House";
  if (t === "Townhouse" || t === "Villa") return "Townhouse_Villa";
  if (t === "Unit" || t === "Apartment") return "Unit_Apartment";
  return "Other";
}

async function runBacktest() {
  const sql = getSql();
  try {
    const suburbs = await sql`
      SELECT suburb, COUNT(*)::int as cnt
      FROM comparable_sales
      WHERE sale_price IS NOT NULL AND sale_price > 50000
        AND (sale_address NOT ILIKE 'Lot %' AND sale_address NOT ILIKE 'Lot,%')
      GROUP BY suburb
      HAVING COUNT(*)::int >= 8
      ORDER BY RANDOM()
      LIMIT 40
    `;
    console.log(`📋 ${suburbs.length} suburbs\n`);

    let all = [], skips = { vacant:0, nocomps:0, fail:0 };
    for (const row of suburbs) {
      const suburb = row.suburb;
      const records = await sql`
        SELECT * FROM comparable_sales
        WHERE suburb = ${suburb} AND sale_date IS NOT NULL AND sale_price IS NOT NULL AND sale_price > 50000
          AND (sale_address NOT ILIKE 'Lot %' AND sale_address NOT ILIKE 'Lot,%')
        ORDER BY RANDOM() LIMIT 5
      `;
      for (const rec of records) {
        const st = cleanType(rec.property_type, rec.sub_property_type, rec.sale_address);
        if (st === "Vacant land" || st === "Other" || st === "Apartment") { skips.vacant++; continue; }

        const subject = {
          address: rec.sale_address, suburb: rec.suburb, state:"VIC", postcode: rec.postcode,
          propertyType: st, bedrooms: rec.bedrooms, bathrooms: rec.bathrooms,
          carSpaces: rec.car_spaces, landSize: rec.land_size,
          expectedValue: rec.sale_price
        };

        // Same type group only
        const tg = compTypeGroup(st);
        const comps = await sql`
          SELECT * FROM comparable_sales
          WHERE suburb = ${suburb} AND sale_address != ${rec.sale_address}
            AND sale_date IS NOT NULL AND sale_price IS NOT NULL AND sale_price > 50000
            AND (sale_address NOT ILIKE 'Lot %' AND sale_address NOT ILIKE 'Lot,%')
          ORDER BY ABS(EXTRACT(EPOCH FROM (sale_date - ${rec.sale_date}::timestamp)))
          LIMIT 30
        `;

        // Post-filter by type group and price bracket
        let filteredComps = comps.filter(c => compTypeGroup(c.property_type, c.sub_property_type, c.sale_address) === tg);

        // Price bracket: only comps within 0.33x to 3x of subject price  
        const subPrice = Number(rec.sale_price);
        if (filteredComps.length >= 5) {
          const kept = filteredComps.filter(c => {
            const r = Number(c.sale_price) / subPrice;
            return r >= 0.33 && r <= 3.0;
          });
          // If we still have 5+, use them; otherwise fallback to unfiltered
          if (kept.length >= 3) filteredComps = kept;
        } else {
          // If type group gives too few, fallback but still price-filter
          filteredComps = comps.filter(c => {
            const r = Number(c.sale_price) / subPrice;
            return r >= 0.33 && r <= 3.0 && !isVacant(c.sale_address);
          });
        }

        if (filteredComps.length < 3) { skips.nocomps++; continue; }

        const result = valueProperty({
          subject,
          comparables: filteredComps.map(c => ({
            salePrice: c.sale_price, saleDate: c.sale_date, address: c.sale_address,
            propertyType: c.property_type,
            subPropertyType: c.sub_property_type || null,
            bedrooms: c.bedrooms, bathrooms: c.bathrooms, carSpaces: c.car_spaces,
            landSize: c.land_size, sourceUrl: c.source_url,
            sourceCount: c.source_count || 1,
            verificationStatus: c.verification_status || "single_source_observed",
            distanceMeters: null
          })),
          asOfDate: rec.sale_date
        });

        if (!result.ok) { skips.fail++; continue; }

        const act = Number(rec.sale_price);
        const mid = result.estimate.midpoint;
        all.push({
          suburb: rec.suburb, address: rec.sale_address, type: st,
          actualPrice: act, estimateMidpoint: mid, deviation: (mid - act) / act,
          anchor: result.estimate.anchor,
          factorTotal: result.estimate.factorTotal,
          confidence: result.confidence.label, dataScore: result.confidence.dataScore,
          compCount: result.acceptedComparables.length
        });
        if (all.length >= 100) break;
      }
      if (all.length >= 100) break;
    }

    if (!all.length) { console.log("❌ No results"); return; }

    const abs = all.map(r => Math.abs(r.deviation));
    const sAbs = [...abs].sort((a,b) => a-b);
    const sDev = [...all.map(r => r.deviation)].sort((a,b) => a-b);
    const medAbs = sAbs[Math.floor(abs.length/2)];
    const medDev = sDev[Math.floor(all.length/2)];
    const meanAbs = abs.reduce((s,v) => s+v, 0) / abs.length;

    const w = (p) => abs.filter(d => d <= p/100).length;

    console.log(`\n══════════════════════════════════════════`);
    console.log(`  📊 BACKTEST v2 — 修复后`);
    console.log(`══════════════════════════════════════════`);
    console.log(`  Tested:       ${all.length}`);
    console.log(`  Skipped:      Lot=${skips.vacant} NoComps=${skips.nocomps} Fail=${skips.fail}`);
    console.log(`  Median Dev:   ${(medDev*100).toFixed(1)}%`);
    console.log(`  Median |Dev|: ${(medAbs*100).toFixed(1)}%`);
    console.log(`  Mean |Dev|:   ${(meanAbs*100).toFixed(1)}%`);
    console.log(`  Within ±5%:   ${w(5)}/${all.length} (${(w(5)/all.length*100).toFixed(0)}%)`);
    console.log(`  Within ±10%:  ${w(10)}/${all.length} (${(w(10)/all.length*100).toFixed(0)}%)`);
    console.log(`  Within ±15%:  ${w(15)}/${all.length} (${(w(15)/all.length*100).toFixed(0)}%)`);
    console.log(`  Within ±20%:  ${w(20)}/${all.length} (${(w(20)/all.length*100).toFixed(0)}%)`);
    console.log(`══════════════════════════════════════════\n`);

    // By confidence
    const cg = {};
    for (const r of all) {
      if (!cg[r.confidence]) cg[r.confidence] = { n:0, devs:[] };
      cg[r.confidence].n++; cg[r.confidence].devs.push(Math.abs(r.deviation));
    }
    console.log("  By Confidence:");
    for (const [l, g] of Object.entries(cg).sort()) {
      const ga = [...g.devs].sort((a,b) => a-b);
      console.log(`    ${l.padEnd(14)} ${g.n} props | med |dev| ${(ga[Math.floor(g.devs.length/2)]*100).toFixed(1)}%`);
    }

    // By price bracket
    const brackets = [
      { label:"<$600k", f: r => r.actualPrice < 600000 },
      { label:"$600k-$900k", f: r => r.actualPrice >= 600000 && r.actualPrice < 900000 },
      { label:"$900k-$1.4m", f: r => r.actualPrice >= 900000 && r.actualPrice < 1400000 },
      { label:"$1.4m-$2m", f: r => r.actualPrice >= 1400000 && r.actualPrice < 2000000 },
      { label:">$2m", f: r => r.actualPrice >= 2000000 }
    ];
    console.log("\n  By Price:");
    for (const bk of brackets) {
      const s = all.filter(bk.f);
      if (!s.length) continue;
      const d = s.map(r => Math.abs(r.deviation)).sort((a,b) => a-b);
      console.log(`    ${bk.label.padEnd(14)} ${s.length} props | med |dev| ${(d[Math.floor(d.length/2)]*100).toFixed(1)}% | avg dev ${(d.reduce((a,b)=>a+b,0)/d.length*100).toFixed(1)}%`);
    }

    // Table
    console.log(`\n  #  Suburb${" ".repeat(16)}Address${" ".repeat(26)}Type     Actual$     Est$      Dev%   Conf     C`);
    console.log("  " + "─".repeat(103));
    all.forEach((r, i) => {
      const n = String(i+1).padStart(2);
      const sub = r.suburb.padEnd(22).slice(0,22);
      const addr = (r.address || "").padEnd(28).slice(0,28);
      const t = r.type.padEnd(8).slice(0,8);
      const act = String(r.actualPrice.toLocaleString()).padStart(10);
      const est = String(r.estimateMidpoint.toLocaleString()).padStart(10);
      const dev = `${(r.deviation*100).toFixed(1).padStart(6)}%`;
      const conf = r.confidence.padEnd(10).slice(0,10);
      const cc = String(r.compCount);
      console.log(`  ${n} ${sub} ${addr} ${t} ${act} ${est} ${dev} ${conf} ${cc}`);
    });

    // Worst 10
    const sorted = [...all].sort((a,b) => Math.abs(b.deviation) - Math.abs(a.deviation));
    console.log(`\n📉 Worst 10:`);
    sorted.slice(0,10).forEach(r => console.log(`  ${(r.deviation*100).toFixed(1)}% | ${r.address}, ${r.suburb} | A:$${r.actualPrice.toLocaleString()} E:$${r.estimateMidpoint.toLocaleString()} | ${r.compCount} comps | ${r.confidence}${r.factorTotal ? ' | factors:'+(r.factorTotal*100).toFixed(1)+'%' : ''}`));

    console.log(`\n✅ Best 10:`);
    const best = [...all].sort((a,b) => Math.abs(a.deviation) - Math.abs(b.deviation)).slice(0,10);
    best.forEach(r => console.log(`  ${(r.deviation*100).toFixed(1)}% | ${r.address}, ${r.suburb} | A:$${r.actualPrice.toLocaleString()} E:$${r.estimateMidpoint.toLocaleString()} | ${r.compCount} comps | ${r.confidence}`));

    return all;
  } finally {}
}

runBacktest().catch(e => { console.error("FAIL:", e); process.exit(1); });
