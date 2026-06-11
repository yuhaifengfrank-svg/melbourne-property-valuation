import { getSql, ensureSchema } from '../api/_db.js';

const SETS_DIR = '/Users/FrankAI/.openclaw/workspace/content-packs/_data';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
if (!existsSync(SETS_DIR)) mkdirSync(SETS_DIR, { recursive: true });

async function fetch() {
  const sql = getSql();
  await ensureSchema(sql);

  // Helper: write JSON
  const save = (name, data) => {
    writeFileSync(`${SETS_DIR}/${name}.json`, JSON.stringify(data, null, 2));
    if (data.length > 0) {
      console.log(`  ${name}: ${data.length} rows, top=${data[0].suburb} (${data[0].opportunity_score})`);
    }
  };

  // 1. Top Growth — highest growth_5y or growth_3y
  const growth = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score,
           conf_value, conf_growth, conf_yield, conf_vacancy, conf_school, conf_infrastructure
    FROM suburb_metrics
    WHERE growth_3y IS NOT NULL AND overall_confidence IS NOT NULL
    ORDER BY COALESCE(growth_5y, growth_3y) DESC
    LIMIT 20
  `;
  save('growth', growth);

  // 2. Top Value — highest conf_value score (affordability)
  const value = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score,
           conf_value, conf_growth, conf_yield, conf_vacancy, conf_school, conf_infrastructure
    FROM suburb_metrics
    WHERE median_house_price IS NOT NULL AND overall_confidence IS NOT NULL
    ORDER BY median_house_price ASC
    LIMIT 20
  `;
  save('value', value);

  // 3. Top Yield — highest gross_yield
  const yieldTop = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score,
           conf_value, conf_growth, conf_yield, conf_vacancy, conf_school, conf_infrastructure
    FROM suburb_metrics
    WHERE gross_yield IS NOT NULL AND overall_confidence IS NOT NULL
    ORDER BY gross_yield DESC
    LIMIT 20
  `;
  save('yield', yieldTop);

  // 4. Top School — highest school_score
  const school = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score,
           conf_value, conf_growth, conf_yield, conf_vacancy, conf_school, conf_infrastructure
    FROM suburb_metrics
    WHERE school_score IS NOT NULL AND overall_confidence IS NOT NULL
    ORDER BY school_score DESC
    LIMIT 20
  `;
  save('school', school);

  // 5. Top Supply-Constrained — highest supply_constraint_score
  const supply = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score,
           conf_value, conf_growth, conf_yield, conf_vacancy, conf_school, conf_infrastructure
    FROM suburb_metrics
    WHERE supply_constraint_score IS NOT NULL AND overall_confidence IS NOT NULL
    ORDER BY supply_constraint_score DESC
    LIMIT 20
  `;
  save('supply', supply);

  // 6. Fetch suburb intelligence for key deep-dive suburbs
  const deepDives = ['Werribee', 'Scoresby', 'Deer Park', 'Clyde North', 'Glen Waverley', 'Tarneit', 'Point Cook', 'Brighton', 'Box Hill', 'Carnegie', 'Reservoir', 'Sunshine', 'Dandenong', 'Preston', 'Footscray'];
  
  // Use the factor-breakdown function if available, else raw DB query
  const deep = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score,
           conf_value, conf_growth, conf_yield, conf_vacancy, conf_school, conf_infrastructure,
           supply_is_growth_corridor, supply_unemployment_rate, supply_housing_stock
    FROM suburb_metrics
    WHERE LOWER(suburb) = ANY(${deepDives.map(s => s.toLowerCase())})
  `;
  save('deep_dives', deep);

  await sql.end({ timeout: 3 });
  console.log('=== All data fetched ===');
  process.exit(0);
}

fetch().catch(e => { console.error(e); process.exit(1); });
