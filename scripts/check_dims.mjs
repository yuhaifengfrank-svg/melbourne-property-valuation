import {createRequire} from 'module';
const require=createRequire(import.meta.url);
import {readFileSync} from 'fs';
const env=readFileSync('/Users/FrankAI/Documents/澳洲房地产评估系统/.env','utf8');
const m=env.match(/DATABASE_URL='([^']+)'/);
const {neon}=require('@neondatabase/serverless');
const sql=neon(m[1]);

async function run() {
  // 1. suburb_metrics columns list
  const cols=await sql.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='suburb_metrics' ORDER BY ordinal_position");
  const colNames = cols.map(r => r.column_name);
  
  // 2. Check each dimension
  const dimQ = [
    ['income', ['median_rent', 'median_house_rent', 'median_unit_rent', 'gross_yield', 'conf_income']],
    ['population', ['population_2025', 'population_2021', 'population_projection_2036', 'population_growth', 'population_cagr_5y', 'population_growth_1y', 'population_score', 'net_migration', 'working_age_share']],
    ['school', ['school_score']],
    ['supply/land', ['supply_housing_stock', 'supply_housing_per_capita', 'supply_dwelling_growth', 'supply_land_release_indicator', 'supply_precinct_proximity', 'supply_growth_corridor_score', 'supply_risk_score', 'supply_constraint_score', 'supply_employment_growth', 'supply_unemployment_rate']],
    ['infrastructure', ['infrastructure_score', 'conf_infrastructure']],
    ['employment', ['working_age_share', 'supply_unemployment_rate', 'supply_employment_growth']],
    ['planning', ['supply_growth_corridor_score', 'supply_land_release_indicator', 'supply_precinct_proximity']],
    ['vacancy', ['vacancy_rate', 'vacancy_rate_adjusted', 'conf_vacancy']],
    ['migration', ['net_migration', 'population_growth', 'household_growth']],
  ];

  console.log('=== 各维度数据覆盖 ===');
  for (const [dim, search] of dimQ) {
    const found = [];
    for (const c of search) {
      if (!colNames.includes(c)) continue;
      const q=await sql.query("SELECT COUNT(*)FILTER(WHERE "+c+" IS NOT NULL) as filled FROM suburb_metrics WHERE state='VIC'");
      found.push(c + '('+q[0].filled+'/280)');
    }
    console.log(dim + ': ' + (found.length ? found.join(', ') : '❌ 无数据'));
  }

  // 3. Interest rate - none in table, macro level
  console.log('\ninterest_rate: ❌ 宏观变量，所有 suburb 相同');

  // 4. Census g02 keys (income)
  const samp=await sql.query("SELECT jsonb_object_keys(g02) as key FROM census_sa2_data LIMIT 30");
  console.log('\n=== Census g02 (income) keys ===');
  samp.forEach(r => console.log(r.key));

  // 5. Census other tables  
  const ctabs=await sql.query("SELECT column_name FROM information_schema.columns WHERE table_name='census_sa2_data' AND column_name SIMILAR TO 'g[0-9][0-9]'");
  console.log('\n=== Census SA2 JSONB columns ===');
  ctabs.forEach(r => console.log(r.column_name));
}
run().catch(e=>{console.error(e);process.exit(1)});
