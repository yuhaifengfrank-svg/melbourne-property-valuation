import { getSql, ensureSchema } from '../api/_db.js';

const SETS_DIR = '/Users/FrankAI/.openclaw/workspace/content-packs/_data';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
if (!existsSync(SETS_DIR)) mkdirSync(SETS_DIR, { recursive: true });

async function fetch() {
  const sql = getSql();
  await ensureSchema(sql);

  const save = (name, data) => {
    writeFileSync(`${SETS_DIR}/${name}.json`, JSON.stringify(data, null, 2));
    if (data.length > 0) {
      console.log(`  ${name}: ${data.length} rows, top=${data[0].suburb}`);
    } else {
      console.log(`  ${name}: 0 rows`);
    }
  };

  // Under $800k with good growth + school
  const under800k = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score
    FROM suburb_metrics
    WHERE median_house_price IS NOT NULL AND median_house_price <= 800000
      AND overall_confidence IS NOT NULL
    ORDER BY opportunity_score DESC
    LIMIT 20
  `;
  save('under_800k', under800k);

  // First Home Buyer friendly (cheap + some growth + low vacancy)
  const firstHome = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score
    FROM suburb_metrics
    WHERE median_house_price IS NOT NULL AND median_house_price <= 650000
      AND overall_confidence IS NOT NULL AND growth_3y IS NOT NULL
    ORDER BY opportunity_score DESC
    LIMIT 20
  `;
  save('first_home', firstHome);

  // Family-friendly (school > 50, some data population)
  const family = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score
    FROM suburb_metrics
    WHERE school_score >= 60 AND median_house_price IS NOT NULL
      AND overall_confidence IS NOT NULL
      AND median_house_price > 0
    ORDER BY opportunity_score DESC
    LIMIT 20
  `;
  save('family', family);

  // School zone under $1M
  const schoolUnder1M = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score
    FROM suburb_metrics
    WHERE school_score >= 60 AND median_house_price IS NOT NULL
      AND overall_confidence IS NOT NULL
      AND median_house_price BETWEEN 300000 AND 1000000
    ORDER BY school_score DESC
    LIMIT 20
  `;
  save('school_under_1m', schoolUnder1M);

  // Supply-constrained: use vacancy_rate AS supply signal (low vacancy = constrained)
  // Also check supply_constraint_score fallback
  const supplyAlternate = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score
    FROM suburb_metrics
    WHERE vacancy_rate IS NOT NULL AND overall_confidence IS NOT NULL
      AND vacancy_rate > 0 AND vacancy_rate < 100
    ORDER BY vacancy_rate ASC
    LIMIT 20
  `;
  save('supply_alternate', supplyAlternate);

  // Undervalued: using conf_value + opportunity_score as proxy
  // (high opportunity + affordable = potential undervaluation signal)
  const undervalued = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score
    FROM suburb_metrics
    WHERE median_house_price IS NOT NULL AND overall_confidence IS NOT NULL
      AND opportunity_score >= 20
    ORDER BY median_house_price ASC
    LIMIT 20
  `;
  save('undervalued', undervalued);

  // Highest opportunity suburbs overall
  const topOverall = await sql`
    SELECT suburb, opportunity_score, opportunity_type, overall_confidence,
           median_house_price, median_unit_price, gross_yield, growth_1y, growth_3y, growth_5y,
           school_score, vacancy_rate, population_growth, supply_constraint_score
    FROM suburb_metrics
    WHERE overall_confidence IS NOT NULL
    ORDER BY opportunity_score DESC
    LIMIT 20
  `;
  save('top_overall', topOverall);

  console.log('=== All data v2 fetched ===');
  process.exit(0);
}

fetch().catch(e => { console.error(e); process.exit(1); });
