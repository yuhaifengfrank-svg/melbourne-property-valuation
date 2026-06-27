// growth-formula-v2.js — growth_3y 计算公式 v2
//
// growth_3y = VGV × [0.30 + 0.15×(1+学区调) + 0.15×(1+供应调) + 0.10×(1+空置调) + 0.05×(1+价格调) + 0.15×(1+宏观调) + 0.10×(1+人口调)]
//
// 各因子调整值基于偏离中位的幅度

import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const MAX_GROWTH = 20;
const MIN_GROWTH = -5;

// 调整函数（返回调整值，如 -0.0016 或 +0.082）
function schoolAdj(score) {
  if (score == null) return 0;
  return (score - 65) / 10 * 0.35;
}

function supplyAdj(score) {
  if (score == null) return 0;
  return (score - 59) / 10 * 0.35;
}

function vacancyAdj(rate) {
  if (rate == null) return 0;
  const capped = Math.min(10, rate);
  return (2.0 - capped) / 0.5 * 0.175;
}

function priceAdj(hp) {
  if (!hp || hp <= 0) return 0;
  const ratio = 1097500 / hp;
  return Math.log(ratio) * 0.875;
}

/**
 * 计算一个 suburb 的 growth_3y
 */
export function computeGrowth3y(m, macro) {
  const vgv = Number(m.vgv_combined_cagr ?? 5.27);
  if (isNaN(vgv)) return NaN;

  // 各因子调整值
  const adj_s = schoolAdj(Number(m.school_score));
  const adj_u = supplyAdj(Number(m.supply_constraint_score));
  const adj_v = vacancyAdj(Number(m.vacancy_rate_adjusted));
  const adj_p = priceAdj(Number(m.median_house_price));

  // 括号内各因子系数
  const c_vgv = 0.30;
  const c_school = 0.15 * (1 + adj_s);
  const c_supply = 0.15 * (1 + adj_u);
  const c_vacancy = 0.10 * (1 + adj_v);
  const c_price = 0.05 * (1 + adj_p);
  const c_macro = 0.15;  // 宏观 = 0
  const c_pop = 0.10;    // 人口 = 0

  const coeff = c_vgv + c_school + c_supply + c_vacancy + c_price + c_macro + c_pop;

  let growth = vgv * coeff;
  growth = Math.round(Math.min(MAX_GROWTH, Math.max(MIN_GROWTH, growth)) * 100) / 100;
  return growth;
}

/**
 * 全量计算并写入 DB
 */
export async function batchComputeAll() {
  const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

  const macroObj = {
    cash_rate: 4.35, unemployment_rate: 4.25, cpi_annual: 3.75, gdp_annual: 1.40
  };

  const suburbs = await sql`
    SELECT suburb, vgv_combined_cagr, median_house_price, school_score,
      supply_constraint_score, population_growth, vacancy_rate_adjusted
    FROM suburb_metrics ORDER BY suburb
  `;

  const results = [];
  for (const m of suburbs) {
    const g = computeGrowth3y(m, macroObj);
    results.push({ suburb: m.suburb, growth_3y: g });

    await sql`
      UPDATE suburb_metrics 
      SET growth_3y = ${g}::numeric,
          updated_at = NOW()
      WHERE LOWER(suburb) = ${m.suburb.toLowerCase()}
    `;
  }

  console.log(`\nComputed growth_3y for ${results.length} suburbs`);

  const vals = results.map(r => r.growth_3y).filter(v => !isNaN(v)).sort((a,b) => a-b);
  const avg = vals.reduce((a,b) => a+b, 0) / vals.length;
  const med = vals[Math.floor(vals.length/2)];
  const q25 = vals[Math.floor(vals.length*0.25)];
  const q75 = vals[Math.floor(vals.length*0.75)];

  console.log(`avg=${avg.toFixed(2)}%, med=${med.toFixed(2)}%`);
  console.log(`min=${vals[0]}%, max=${vals[vals.length-1]}%`);
  console.log(`Q25=${q25}%, Q75=${q75}%`);

  const buckets = {'10%+':0,'8-10%':0,'6-8%':0,'4-6%':0,'2-4%':0,'0-2%':0,'<0%':0};
  vals.forEach(v => {
    if (v >= 10) buckets['10%+']++;
    else if (v >= 8) buckets['8-10%']++;
    else if (v >= 6) buckets['6-8%']++;
    else if (v >= 4) buckets['4-6%']++;
    else if (v >= 2) buckets['2-4%']++;
    else if (v >= 0) buckets['0-2%']++;
    else buckets['<0%']++;
  });
  const total = results.length;
  console.log("\n分布:");
  Object.entries(buckets).forEach(([k, v]) => v > 0 && console.log(`  ${k.padEnd(8)} ${v} (${(v/total*100).toFixed(1)}%)`));

  results.sort((a, b) => b.growth_3y - a.growth_3y);
  console.log("\nTop 10:");
  results.slice(0, 10).forEach(r => console.log(`  ${r.suburb}: ${r.growth_3y}%`));
  console.log("\nBottom 10:");
  results.slice(-10).reverse().forEach(r => console.log(`  ${r.suburb}: ${r.growth_3y}%`));

  // 关键区
  const keySubs = ['mickleham','werribee','brighton','southbank','clayton','glen waverley','tarneit','sorrento','west melbourne','toorak','officer south'];
  console.log("\nKey breakdowns:");
  for (const ks of keySubs) {
    const m = suburbs.find(s => s.suburb.toLowerCase() === ks);
    if (m) {
      const vgv = Number(m.vgv_combined_cagr ?? 5.27);
      const adj_s = schoolAdj(Number(m.school_score));
      const adj_u = supplyAdj(Number(m.supply_constraint_score));
      const adj_v = vacancyAdj(Number(m.vacancy_rate_adjusted));
      const adj_p = priceAdj(Number(m.median_house_price));
      const coeff = 0.30 + 0.15*(1+adj_s) + 0.15*(1+adj_u) + 0.10*(1+adj_v) + 0.05*(1+adj_p) + 0.15 + 0.10;
      const g = computeGrowth3y(m, macroObj);
      console.log(`  ${m.suburb}: ${g}% (coeff=${coeff.toFixed(3)}, adj: 学${adj_s.toFixed(4)} 供${adj_u.toFixed(4)} 空${adj_v.toFixed(4)} 价${adj_p.toFixed(4)})`);
    }
  }

  return results;
}

if (process.argv[1]?.includes('growth-formula-v2')) {
  batchComputeAll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
