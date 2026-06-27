cd "/Users/FrankAI/Documents/澳洲房地产评估系统"
eval "$(grep DATABASE_URL .env)"
export DATABASE_URL

node --input-type=module << 'EOF'
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

const suburbs = await sql`
  SELECT suburb, vgv_combined_cagr, median_house_price, school_score,
    supply_constraint_score, population_growth, vacancy_rate_adjusted
  FROM suburb_metrics ORDER BY suburb
`;

// 先看各因子分布，确定微调幅度
const schools = suburbs.map(s => Number(s.school_score)).filter(v => v != null);
const supplies = suburbs.map(s => Number(s.supply_constraint_score)).filter(v => v != null);
const vacancies = suburbs.map(s => Number(s.vacancy_rate_adjusted)).filter(v => v != null);

function percentile(arr) {
  const s = [...arr].sort((a,b) => a-b);
  return {
    min: s[0],
    q25: s[Math.floor(s.length*0.25)],
    med: s[Math.floor(s.length/2)],
    q75: s[Math.floor(s.length*0.75)],
    max: s[s.length-1]
  };
}

console.log("学区分布:");
const sp = percentile(schools);
console.log(`  min=${sp.min} q25=${sp.q25} med=${sp.med} q75=${sp.q75} max=${sp.max}`);

console.log("供应约束分布:");
const sup = percentile(supplies);
console.log(`  min=${sup.min} q25=${sup.q25} med=${sup.med} q75=${sup.q75} max=${sup.max}`);

console.log("空置率分布:");
const vp = percentile(vacancies);
console.log(`  min=${vp.min} q25=${vp.q25} med=${vp.med} q75=${vp.q75} max=${vp.max}`);

// 中位价分布
const prices = suburbs.map(s => Number(s.median_house_price)).filter(v => v != null && v > 0);
const pp = percentile(prices);
console.log("\n价格分布:");
console.log(`  min=$${pp.min} q25=$${pp.q25} med=$${pp.med} q75=$${pp.q75} max=$${pp.max}`);
EOF
