import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

const suburbs = await sql`
  SELECT suburb, vgv_combined_cagr, median_house_price, school_score,
    supply_constraint_score, population_growth, vacancy_rate_adjusted
  FROM suburb_metrics ORDER BY suburb
`;

function factorContributions(m) {
  const parts = {};
  const vgv = m.vgv_combined_cagr ?? 5.27;
  parts.vgv = { raw: vgv, contrib: vgv * 0.25 };
  if (m.median_house_price && m.median_house_price > 0) {
    const ratio = 1097500 / m.median_house_price;
    const raw = Math.log(ratio) * 2;
    parts.price = { raw: raw, contrib: Math.min(3, Math.max(-3, raw)) * (0.05 / 0.25) };
  } else {
    parts.price = { raw: 0, contrib: 0 };
  }
  const schRaw = (m.school_score - 65) / 10 * 0.8;
  parts.school = { raw: m.school_score, contrib: Math.min(4, Math.max(-4, schRaw)) * (0.15 / 0.25) };
  parts.macro = { raw: 'direction', contrib: 0 };
  const supRaw = (m.supply_constraint_score - 59) / 10 * 0.5;
  parts.supply = { raw: m.supply_constraint_score, contrib: Math.min(2, Math.max(-2, supRaw)) * (0.15 / 0.25) };
  parts.population = { raw: 1.5, contrib: 0 };
  const vacCapped = Math.min(10, Math.max(0.1, m.vacancy_rate_adjusted));
  const vacRaw = (2.0 - vacCapped) / 0.5 * 0.5;
  parts.vacancy = { raw: m.vacancy_rate_adjusted, contrib: Math.min(4, Math.max(-4, vacRaw)) * (0.10 / 0.25) };
  parts.total = Object.values(parts).reduce((s, p) => s + p.contrib, 0);
  return parts;
}

const keys = ['vgv','price','school','macro','supply','population','vacancy'];
const analysis = {};
for (const k of keys) analysis[k] = [];

for (const m of suburbs) {
  const f = factorContributions(m);
  for (const k of keys) {
    analysis[k].push({ suburb: m.suburb, contrib: f[k].contrib, raw: f[k].raw });
  }
}

console.log("=== 各因子对 growth_3y 的贡献分布 ===\n");
for (const k of keys) {
  const vals = analysis[k].map(x => x.contrib).sort((a,b) => a-b);
  const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
  const med = vals[Math.floor(vals.length/2)];
  const q25 = vals[Math.floor(vals.length*0.25)];
  const q75 = vals[Math.floor(vals.length*0.75)];
  const sortedByAbs = [...analysis[k]].sort((a,b) => Math.abs(b.contrib) - Math.abs(a.contrib));
  const weights = { vgv:'25%', price:'5%', school:'15%', macro:'15%', supply:'15%', population:'10%', vacancy:'10%' };

  console.log(`▓ ${k} (权重 ${weights[k]})`);
  console.log(`  贡献范围: ${vals[0].toFixed(4)} ~ ${vals[vals.length-1].toFixed(4)} (幅度: ${(vals[vals.length-1]-vals[0]).toFixed(4)})`);
  console.log(`  avg=${avg.toFixed(4)}  med=${med.toFixed(4)}  q25=${q25.toFixed(4)}  q75=${q75.toFixed(4)}`);
  console.log(`  正向最大3: ${sortedByAbs.slice(0,3).map(x => `${x.suburb}(${x.contrib > 0 ? '+' : ''}${x.contrib.toFixed(3)},${k==='vgv'?'cagr':k==='school'?'score':k==='supply'?'score':k==='vacancy'?'rate':k==='price'?'log':''}=${Number(x.raw||0).toFixed(2)})`).join(', ')}`);
  const negs = sortedByAbs.filter(x => x.contrib < 0);
  if (negs.length > 0) {
    console.log(`  负向最大3: ${negs.slice(-3).reverse().map(x => `${x.suburb}(${x.contrib.toFixed(3)},${k==='vgv'?'cagr':k==='school'?'score':k==='supply'?'score':k==='vacancy'?'rate':k==='price'?'log':''}=${Number(x.raw||0).toFixed(2)})`).join(', ')}`);
  }
  console.log('');
}

const totals = suburbs.map(m => factorContributions(m).total);
const tVals = [...totals].sort((a,b)=>a-b);
console.log("=== 总分分布 ===");
console.log(`范围: ${tVals[0].toFixed(2)} ~ ${tVals[tVals.length-1].toFixed(2)} (幅度: ${(tVals[tVals.length-1]-tVals[0]).toFixed(2)})`);
console.log(`avg: ${(tVals.reduce((a,b)=>a+b,0)/tVals.length).toFixed(2)}  med: ${tVals[Math.floor(tVals.length/2)].toFixed(2)}`);
console.log(`q25: ${tVals[Math.floor(tVals.length*0.25)].toFixed(2)}  q75: ${tVals[Math.floor(tVals.length*0.75)].toFixed(2)}`);
