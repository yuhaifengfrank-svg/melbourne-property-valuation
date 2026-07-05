// dump-valuation.mjs — 本地跑完整估值链路并输出全量数据
// 用法: node scripts/dump-valuation.mjs

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
config({ path: resolve(root, '.env.local') });

const { getSql } = await import(`file://${root}/api/_db.js`);
const { valueProperty } = await import(`file://${root}/lib/valuation-engine.js`);

const sql = getSql();

// ── Step 1: 查 DB comparable ──
// TYPE_COMPAT: Unit→Unit/Townhouse/Villa (already updated)
const rows = await sql`
  SELECT * FROM comparable_sales
  WHERE suburb ILIKE 'Oakleigh'
    AND state = 'VIC'
    AND property_type = ANY(${['Unit','Townhouse','Villa']}::text[])
    AND sale_date >= CURRENT_DATE - 730
  ORDER BY sale_date DESC NULLS LAST
  LIMIT 12
`;

console.log('📦 RAW DB (Level A — Oakleigh + Unit/Townhouse/Villa)');
console.log('========================================================');
for (const r of rows) {
  console.log(JSON.stringify({
    address: r.sale_address,
    salePrice: r.sale_price,
    saleDate: r.sale_date ? r.sale_date.toISOString().slice(0,10) : null,
    propertyType: r.property_type,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    carSpaces: r.car_spaces,
    landSize: r.land_size_sqm,
    lat: r.lat,
    lon: r.lon,
    sourceName: r.source_name
  }));
}

// ── Step 2: 构建 comparable records ──
const comparables = rows.map(r => ({
  address: r.sale_address || '',
  salePrice: r.sale_price || 0,
  saleDate: r.sale_date ? r.sale_date.toISOString().slice(0,10) : null,
  propertyType: r.property_type || null,
  bedrooms: r.bedrooms || null,
  bathrooms: r.bathrooms || null,
  carSpaces: r.car_spaces || null,
  landSize: r.land_size_sqm || null,
  lat: r.lat,
  lon: r.lon,
  distanceMeters: null,
  sourceName: r.source_name || null,
  verificationStatus: r.verification_status || 'unverified'
}));

// Haversine
function distanceBetween(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
const subLat = -37.9102, subLon = 145.099;
for (const c of comparables) {
  if (c.lat != null && c.lon != null)
    c.distanceMeters = Math.round(distanceBetween(subLat, subLon, Number(c.lat), Number(c.lon)));
}

const subject = {
  address: '11 McIntosh St',
  suburb: 'Oakleigh',
  state: 'VIC',
  postcode: '3166',
  propertyType: 'Unit',
  coordinates: { lat: subLat, lon: subLon }
};

// ── Step 3: 跑估值引擎 ──
console.log('\n⚙️  Running valueProperty...');
const result = valueProperty({ subject, comparables, asOfDate: '2026-06-28' });

if (!result.ok) {
  console.log('❌ Valuation failed:', result.status);
  process.exit(1);
}

const e = result.estimate;

console.log(`\n📊 ESTIMATE`);
console.log(`  midpoint:       $${e.midpoint.toLocaleString()}`);
console.log(`  anchor:         $${e.anchor.toLocaleString()}`);
console.log(`  low:            $${e.low.toLocaleString()}`);
console.log(`  high:           $${e.high.toLocaleString()}`);
console.log(`  weightedMedian: $${e.weightedMedian.toLocaleString()}`);
console.log(`  weightedMean:   $${e.weightedMean.toLocaleString()}`);
console.log(`  sigma:          ${(e.sigma*100).toFixed(2)}%`);
console.log(`  factorTotal:    ${(e.factorTotal*100).toFixed(2)}%`);
console.log(`  customerHalfRange: ${(e.customerHalfRange*100).toFixed(2)}%`);

console.log(`\n🔧 FACTOR ADJUSTMENTS:`);
for (const f of e.factorAdjustments) {
  console.log(`  ${f.name}: ${(f.value*100).toFixed(4)}% ${f.detail ? '('+f.detail+')' : ''}`);
}

console.log(`\n✅ ACCEPTED (${result.acceptedComparables.length}):`);
for (const c of result.acceptedComparables) {
  console.log(`  ${c.address}`);
  console.log(`    salePrice=$${c.salePrice.toLocaleString()} → timeAdj=$${c.timeAdjustedPrice.toLocaleString()} (${(c.timeAdjustment*100).toFixed(2)}%)`);
  console.log(`    ${c.saleDate} | ${c.distanceMeters}m | ${c.propertyType} | ${c.bedrooms||'?'}br/${c.bathrooms||'?'}ba/${c.carSpaces||'?'}car | ${c.landSize||'?'}sqm`);
  console.log(`    quality=${c.qualityScore} band=${c.qualityBand} weight=${c.weight}`);
}

console.log(`\n❌ REJECTED (${result.rejectedComparables.length}):`);
for (const c of result.rejectedComparables) {
  console.log(`  [${c.reasons.join(', ')}] ${c.address}`);
}

console.log(`\n📈 CONFIDENCE:`);
console.log(`  label: ${result.confidence.label}`);
console.log(`  dataScore: ${result.confidence.dataScore}`);
if (result.confidence.sigma != null) console.log(`  sigma: ${(result.confidence.sigma*100).toFixed(2)}%`);
for (const r of result.confidence.reasons || []) console.log(`  - ${r}`);

process.exit(0);
