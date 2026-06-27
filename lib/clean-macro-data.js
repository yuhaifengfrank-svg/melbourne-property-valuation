// clean-macro-data.js — 清洗 macro_indicators 表
// 删除不合理数据，只保留可信记录
// 用法: node lib/clean-macro-data.js

import { neon } from "@neondatabase/serverless";
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

// ====== 各指标的合理性范围 ======
const RANGES = {
  'cash_rate':            { min: 0.0, max: 7.0,   minYear: 2018, reason: 'RBA cash rate modern range' },
  'bill_90d_rate':        { min: 0.0, max: 7.0,   minYear: 2018, reason: '90-day bank bill rate' },
  'housing_loan_var_oo':  { min: 2.0, max: 12.0,  minYear: 2018, reason: 'Variable OO rate' },
  'housing_loan_var_investor': { min: 2.0, max: 12.0, minYear: 2018, reason: 'Variable investor rate' },
  'housing_loan_3y_fixed_oo': { min: 1.0, max: 10.0, minYear: 2018, reason: '3yr fixed OO rate' },
  'housing_loan_3y_fixed_investor': { min: 1.0, max: 10.0, minYear: 2018, reason: '3yr fixed investor rate' },
};

const FIXED_VALUES = {
  // 指标: 已知正确的最新值（手动确认的）
  'participation_rate_aus': null,  // 要删除重新拉
};

async function main() {
  let deleted = 0;
  let fixed = 0;

  for (const [indicator, range] of Object.entries(RANGES)) {
    // 1) 删除超出范围的值
    const res1 = await sql`
      DELETE FROM macro_indicators 
      WHERE indicator = ${indicator}
        AND (value < ${range.min} OR value > ${range.max} OR recorded_date < ${range.minYear + '-01-01'}::date)
      RETURNING id, value, recorded_date
    `;
    if (res1.length > 0) {
      console.log(`[${indicator}] deleted ${res1.length} out-of-range records`);
      res1.slice(0, 3).forEach(r => console.log(`  -> id=${r.id} value=${r.value} date=${String(r.recorded_date).substring(0,10)}`));
      if (res1.length > 3) console.log(`  ... and ${res1.length - 3} more`);
      deleted += res1.length;
    }

    // 2) 检查是否有超出 minYear 的异常——可能还有 date 正常但 value 不合理的
    const remaining = await sql`
      SELECT COUNT(*)::int as cnt,
        MIN(value)::numeric(6,3) as min_v,
        MAX(value)::numeric(6,3) as max_v,
        MIN(recorded_date) as min_d,
        MAX(recorded_date) as max_d
      FROM macro_indicators WHERE indicator = ${indicator}
    `;
    if (remaining.length > 0) {
      console.log(`  -> remaining: ${remaining[0].cnt} records, ${remaining[0].min_v}~${remaining[0].max_v}, ${String(remaining[0].min_d).substring(0,10)}~${String(remaining[0].max_d).substring(0,10)}`);
    }
  }

  // 处理 participation_rate_aus — 删除明显错误的值，标记待更新
  const badPart = await sql`
    DELETE FROM macro_indicators 
    WHERE indicator = 'participation_rate_aus'
    RETURNING id, value
  `;
  if (badPart.length > 0) {
    console.log(`[participation_rate_aus] deleted ${badPart.length} bad records (value=${badPart[0].value}, should be ~66.8)`);
    deleted += badPart.length;
  }

  // 总结
  console.log(`\nCleanup complete: ${deleted} records deleted`);

  // 打印最终状态
  const stats = await sql`
    SELECT indicator, COUNT(*)::int as cnt, 
      ROUND(MIN(value)::numeric, 2) as min_v,
      ROUND(MAX(value)::numeric, 2) as max_v
    FROM macro_indicators
    GROUP BY indicator ORDER BY indicator
  `;
  console.log("\nFinal state:");
  stats.forEach(s => console.log(`  ${s.indicator}: ${s.cnt} records, ${s.min_v}~${s.max_v}`));
}

main().catch(e => { console.error(e); process.exit(1); });
