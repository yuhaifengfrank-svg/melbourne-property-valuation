import { scrapeSoldData } from "./lib/browser-collector.js";
import { valueProperty } from "./lib/valuation-engine.js";

const tests = [
  { label: "NSW House: 57 Churchill Dr, Winston Hills NSW 2153", suburb: "Winston Hills", state: "NSW", type: "House", bed: 3, bath: 2, car: 1, land: 651 },
  { label: "QLD Townhouse: 48/26 Yaun St, Coomera QLD 4209", suburb: "Coomera", state: "QLD", type: "Townhouse", bed: 3, bath: 2, car: 1, land: 141 },
  { label: "WA Apartment: 706/105 Stirling St, Perth WA 6000", suburb: "Perth", state: "WA", type: "Apartment", bed: 1, bath: 1, car: 1, land: 49 }
];

for (const t of tests) {
  console.log(`\n══════ ${t.label} ══════`);

  const all = await scrapeSoldData(t.suburb, t.state);
  const types = {};
  all.forEach(s => { types[s.propertyType] = (types[s.propertyType] || 0) + 1; });
  console.log(`Unique: ${all.length} | Types:`, JSON.stringify(types));

  const matched = all.filter(s => s.propertyType === t.type)
    .sort((a, b) => Math.abs(a.price - 1000000) - Math.abs(b.price - 1000000))
    .slice(0, 6);

  if (matched.length === 0) {
    // fallback：如果没匹配到该类型，用所有
    const allTypes = all.sort((a,b) => Math.abs(a.price - 1000000) - Math.abs(b.price - 1000000)).slice(0,6);
    console.log(`No ${t.type} found, using ${allTypes.length} mixed`);
    matched.push(...allTypes);
  }

  console.log(`Matched: ${matched.length} (${t.type})`);
  matched.forEach((s, i) => console.log(`  ${i+1}. ${s.address} → $${(s.price/1000).toFixed(0)}k  ${s.bedrooms||"-"}br ${s.landSize||"-"}m² [${s.source}]`));

  if (matched.length >= 2) {
    const v = valueProperty({
      subject: { address: t.label.split(":")[1]?.trim() || t.label, propertyType: t.type,
        bedrooms: t.bed, bathrooms: t.bath, carSpaces: t.car, landSize: t.land,
        conditionScore: 3, microLocationScore: 3, streetQualityScore: 3,
        planningScore: 3, riskScore: 2 },
      comparables: matched.map((s, i) => ({
        address: s.address, propertyType: t.type, salePrice: s.price, saleDate: "2026-06-01",
        distanceMeters: 500 + i * 400,
        bedrooms: s.bedrooms || t.bed, bathrooms: s.bathrooms || t.bath, carSpaces: s.carSpaces || t.car,
        landSize: s.landSize || t.land,
        sourceUrl: `https://${s.source}/sold/${i}`,
        sourceCount: s.source.includes("+") ? 2 : 1,
        conditionScore: 3, microLocationScore: 3, streetQualityScore: 3,
        planningScore: 3, riskScore: 2
      }))
    });

    if (v.ok && v.estimate) {
      console.log(`→ 估值中点: $${(v.estimate.midpoint/1000).toFixed(0)}k`);
      console.log(`  ${t.type} 1σ 区间: $${(v.estimate.low/1000).toFixed(0)}k - $${(v.estimate.high/1000).toFixed(0)}k`);
      console.log(`  置信度: ${v.confidence.label} (${v.confidence.dataScore}/100)`);
      console.log(`  σ: ${(v.statisticalIntervals?.sigma * 100).toFixed(1)}%`);
      console.log(`  接受: ${v.acceptedComparables.length}, 拒绝: ${v.rejectedComparables.length}`);
      v.acceptedComparables.slice(0,3).forEach(c =>
        console.log(`  [${c.qualityBand}] ${c.address} → $${(c.salePrice/1000).toFixed(0)}k (${c.qualityScore}/100)`));
    } else {
      console.log(`  估值失败:`, v.status);
    }
  } else {
    console.log(`  数据不足`);
  }
}

console.log(`\n══════ Done ══════`);
