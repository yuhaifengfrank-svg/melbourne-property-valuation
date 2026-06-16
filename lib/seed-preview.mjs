/**
 * lib/seed-preview.mjs  — Preview DB Seed 核心模块
 *
 * ── Guards ─────────────────────────────────────────────────────
 * 1. PRODUCTION_DATABASE_URL and PREVIEW_DATABASE_URL from env
 * 2. Parses both URLs; aborts if same host/db endpoint
 * 3. Production access: Neon readOnly:true (DB层只读事务) + SELECT allowlist (代码层保护)
 * 4. Preview writes: single tx.transaction([...]) — any failure rolls back all
 * 5. school_locations 使用 ON CONFLICT (acara_sml_id) DO NOTHING（PK）
 * 6. census_sa2_data 使用 ON CONFLICT (sa2_code) DO NOTHING（PK）
 * 7. school_profiles / comparable_sales 使用 WHERE NOT EXISTS 实现幂等（无 UNIQUE/PK）
 * 8. 计数只计入实际插入行 (rowCount > 0)
 * 9. No DROP, TRUNCATE, DELETE anywhere
 * 10. No access to: leads, lead_*, consent_*, report_*, stripe_*
 * 11. Schema 验证：information_schema 检查所有实际 INSERT 列
 *
 * 本模块可安全 import，不连接数据库，不 process.exit。
 */

import { neon } from '@neondatabase/serverless';

// ================================================================
// 常量
// ================================================================
const SELECT_CMD_RE = /^\s*SELECT\b/i;

// school_locations INSERT 全部列
const SL_COLS = [
  'calendar_year', 'acara_sml_id', 'location_age_id', 'school_age_id',
  'rolled_school_id', 'school_name', 'suburb', 'state', 'postcode',
  'school_sector', 'school_type', 'special_school', 'campus_type',
  'latitude', 'longitude', 'abs_remoteness_area', 'abs_remoteness_name',
  'meshblock', 'sa1', 'sa2_code', 'sa2_name', 'sa3_code', 'sa3_name',
  'sa4_code', 'sa4_name', 'lga_code', 'lga_name',
  'state_electoral_code', 'state_electoral_name',
  'commonwealth_electoral_code', 'commonwealth_electoral_name',
];

// school_profiles INSERT 全部列
const SP_COLS = [
  'calendar_year', 'acara_sml_id', 'location_age_id', 'school_age_id',
  'school_name', 'suburb', 'state', 'postcode',
  'school_sector', 'school_type', 'campus_type',
  'rolled_reporting_description', 'school_url',
  'governing_body', 'governing_body_url', 'year_range', 'geolocation',
  'icsea', 'icsea_percentile',
  'bottom_sea_quarter_pct', 'lower_middle_sea_quarter_pct',
  'upper_middle_sea_quarter_pct', 'top_sea_quarter_pct',
  'teaching_staff', 'fte_teaching_staff', 'non_teaching_staff',
  'fte_non_teaching_staff', 'total_enrolments',
  'girls_enrolments', 'boys_enrolments', 'fte_enrolments',
  'indigenous_enrolments_pct',
  'lbote_yes_pct', 'lbote_no_pct', 'lbote_not_stated_pct',
];

// comparable_sales INSERT 全部列
const CS_COLS = [
  'sale_address', 'sale_price', 'sale_date', 'property_type',
  'bedrooms', 'bathrooms', 'car_spaces', 'land_size_sqm', 'building_area_sqm',
  'suburb', 'state', 'postcode', 'sa2_code', 'sa2_name',
  'lat', 'lon', 'source_url', 'source_name',
  'raw_price_text', 'collection_date', 'collection_round', 'batch_id',
  'verification_status', 'original_evidence',
];

// census_sa2_data — Preview 精简结构（8 列）
// Preview census_sa2_data 只包含以下现有列：
//   sa2_code (PK), g01, g02, g33, g36, g37, g40, g41
// 不需要 sa2_name, state, 或其他 g03-g45 列
const CENSUS_COLS = [
  'sa2_code',
  'g01',
  'g02',
  'g33',
  'g36',
  'g37',
  'g40',
  'g41',
];

// 以下列为 Preview 语义上必需的（缺失则阻断）
const CENSUS_REQUIRED = new Set(['sa2_code', 'g01', 'g02', 'g36', 'g37']);

// Schema 验证配置：每个表的全部 INSERT 列
// 导出以便测试验证
export const SCHEMA_COLUMNS = [
  { table: 'school_locations',     columns: SL_COLS },
  { table: 'school_profiles',      columns: SP_COLS },
  { table: 'comparable_sales',     columns: CS_COLS },
  { table: 'census_sa2_data',      columns: CENSUS_COLS },
];

// 约束验证配置：INSERT 依赖的冲突约束
// school_profiles 无 UNIQUE/PK，使用 WHERE NOT EXISTS，不要求约束
const REQUIRED_CONSTRAINTS = [
  {
    table: 'school_locations',
    // 需要 acara_sml_id 上有 PRIMARY KEY 或 UNIQUE
    checkKey: 'acara_sml_id',
  },
  {
    table: 'census_sa2_data',
    // 需要 sa2_code 上有 PRIMARY KEY 或 UNIQUE
    checkKey: 'sa2_code',
  },
];

// ================================================================
// parseNeon — 解析 Neon 连接字符串
// ================================================================
export function parseNeon(url) {
  try {
    const m = url.match(/@([^/]+)\/([^?]+)/);
    if (!m) return null;
    const rawHost = m[1].toLowerCase().replace(/\]/g, '').replace(/\[/g, '');
    const hostNorm = rawHost.replace(/-pooler\./, '.');
    const dbName  = m[2].split('?')[0];
    return { hostNorm, dbName, rawHost };
  } catch {
    return null;
  }
}

// ================================================================
// createProductionReader — 创建只读生产连接
// Neon readOnly:true -> DB层面的只读事务保护
// SELECT allowlist -> 代码层面的第二层保护
// 仅暴露 tagged-template 函数，不支持 unsafe() 或 query()
// ================================================================
export function createProductionReader(url) {
  const sql = neon(url, { readOnly: true });

  return function prodTag(strings, ...values) {
    const raw = String.raw(strings, ...values.map(() => '?'));
    if (!SELECT_CMD_RE.test(raw)) {
      throw Object.assign(new Error('SEED_FAILED'), { code: 'SEED_FAILED' });
    }
    return sql(strings, ...values);
  };
}

// ================================================================
// validatePreviewSchema — 验证 Preview 表结构完整性
//
// 返回结构：
//   { ok: true }
// 或
//   { ok: false, table, columns, reason: 'table_missing'|'columns_missing'|'query_failed' }
//
// 不抛原始 Error，不泄露 SQL/URL/host。
// ================================================================
export async function validatePreviewSchema(sql) {
  const results = [];

  for (const tbl of SCHEMA_COLUMNS) {
    // Step 1: check if table exists
    let tableRows;
    try {
      tableRows = await sql`
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tbl.table}
        LIMIT 1
      `;
    } catch (e) {
      results.push({ ok: false, table: tbl.table, columns: [], reason: 'query_failed' });
      continue;
    }

    if (tableRows.length === 0) {
      results.push({ ok: false, table: tbl.table, columns: [], reason: 'table_missing' });
      continue;
    }

    // Step 2: check columns (explicit ::text[] cast for Neon/HTTP adapter)
    let colRows;
    try {
      colRows = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tbl.table}
          AND column_name = ANY(${tbl.columns}::text[])
      `;
    } catch (e) {
      results.push({ ok: false, table: tbl.table, columns: [], reason: 'query_failed' });
      continue;
    }

    const found = new Set(colRows.map(r => r.column_name));
    const missing = tbl.columns.filter(c => !found.has(c));

    if (missing.length > 0) {
      results.push({ ok: false, table: tbl.table, columns: missing, reason: 'columns_missing' });
    } else {
      results.push({ ok: true, table: tbl.table, columns: [], reason: null });
    }
  }

  const failures = results.filter(r => !r.ok);
  if (failures.length > 0) {
    // Throw with structured info — no SQL, no URL, no stack
    const err = Object.assign(new Error('SCHEMA_ERROR'), { code: 'SCHEMA_MISSING', results });
    throw err;
  }

  // Step 3: check INSERT-dependent constraints
  // school_locations: acara_sml_id must have PK or UNIQUE
  // census_sa2_data: sa2_code must have PK or UNIQUE
  // comparable_sales: no constraint needed (uses WHERE NOT EXISTS)
  // school_profiles: no constraint needed (uses WHERE NOT EXISTS)
  const constraintResults = [];

  for (const cr of REQUIRED_CONSTRAINTS) {
    if (cr.checkKey) {
      // Check for PRIMARY KEY or UNIQUE on the specified column
      let pkRows;
      try {
        pkRows = await sql`
          SELECT tc.constraint_type, kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name = ${cr.table}
            AND kcu.column_name = ${cr.checkKey}
            AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
          LIMIT 1
        `;
      } catch (e) {
        constraintResults.push({ ok: false, table: cr.table, reason: 'query_failed', key: cr.checkKey });
        continue;
      }

      if (pkRows.length === 0) {
        constraintResults.push({ ok: false, table: cr.table, reason: 'constraint_missing', key: cr.checkKey });
      } else {
        constraintResults.push({ ok: true, table: cr.table, reason: null, key: cr.checkKey });
      }
    }
    // comparable_sales 无需约束（使用 WHERE NOT EXISTS 实现幂等）
  }

  const constraintFailures = constraintResults.filter(r => !r.ok);
  if (constraintFailures.length > 0) {
    const err = Object.assign(new Error('SCHEMA_ERROR'), { code: 'SCHEMA_CONSTRAINT_MISSING', results: constraintFailures });
    throw err;
  }

  return { ok: true };
}

// ================================================================
// makeProfileInsertSQL — 为单条 school_profiles 生成幂等 INSERT
// 使用 WHERE NOT EXISTS 而非 ON CONFLICT（该表无 UNIQUE/PK）
// 返回 { queryText, params } 供 sql.query() 使用
// ================================================================
function makeProfileInsertSQL(row) {
  const cols = SP_COLS;
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  return {
    queryText: `INSERT INTO school_profiles (${cols.map(c => `"${c}"`).join(', ')})
               SELECT ${placeholders.join(', ')}
               WHERE NOT EXISTS (
                 SELECT 1 FROM school_profiles
                 WHERE acara_sml_id = $${placeholders.length + 1}
                   AND calendar_year = $${placeholders.length + 2}
               )`,
    params: [
      ...cols.map(c => row[c]),
      row.acara_sml_id,
      row.calendar_year,
    ],
  };
}
export function buildPreviewQueries(previewSql, data) {
  const { schools, profiles, comps, extraComps, census } = data;

  // Dedup comps by address
  const compMap = new Map();
  for (const c of comps) compMap.set(c.sale_address?.toLowerCase(), c);
  for (const ec of extraComps) {
    if (!compMap.has(ec.sale_address?.toLowerCase())) compMap.set(ec.sale_address?.toLowerCase(), ec);
  }
  const combinedComps = [...compMap.values()];

  const queries = [];

  // A. school_locations
  for (const r of schools) {
    queries.push(previewSql`
      INSERT INTO school_locations (
        calendar_year, acara_sml_id, location_age_id, school_age_id,
        rolled_school_id, school_name, suburb, state, postcode,
        school_sector, school_type, special_school, campus_type,
        latitude, longitude, abs_remoteness_area, abs_remoteness_name,
        meshblock, sa1, sa2_code, sa2_name, sa3_code, sa3_name,
        sa4_code, sa4_name, lga_code, lga_name,
        state_electoral_code, state_electoral_name,
        commonwealth_electoral_code, commonwealth_electoral_name
      ) VALUES (
        ${r.calendar_year}, ${r.acara_sml_id}, ${r.location_age_id}, ${r.school_age_id},
        ${r.rolled_school_id}, ${r.school_name}, ${r.suburb}, ${r.state}, ${r.postcode},
        ${r.school_sector}, ${r.school_type}, ${r.special_school}, ${r.campus_type},
        ${r.latitude}, ${r.longitude}, ${r.abs_remoteness_area}, ${r.abs_remoteness_name},
        ${r.meshblock}, ${r.sa1}, ${r.sa2_code}, ${r.sa2_name}, ${r.sa3_code}, ${r.sa3_name},
        ${r.sa4_code}, ${r.sa4_name}, ${r.lga_code}, ${r.lga_name},
        ${r.state_electoral_code}, ${r.state_electoral_name},
        ${r.commonwealth_electoral_code}, ${r.commonwealth_electoral_name}
      )
      ON CONFLICT (acara_sml_id) DO NOTHING
    `);
  }

  // B. school_profiles (幂等 — WHERE NOT EXISTS)
  for (const r of profiles) {
    const { queryText, params } = makeProfileInsertSQL(r);
    queries.push(previewSql.query(queryText, params));
  }

  // C. comparable_sales (幂等 — WHERE NOT EXISTS，不依赖唯一约束)
  for (const r of combinedComps) {
    const cols = CS_COLS;
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const vals = cols.map(c => r[c]);
    const query = `INSERT INTO comparable_sales (${cols.map(c => '"' + c + '"').join(', ')})
                   SELECT ${placeholders.join(', ')}
                   WHERE NOT EXISTS (
                     SELECT 1 FROM comparable_sales
                     WHERE sale_address = \$${cols.length + 1}
                       AND sale_date IS NOT DISTINCT FROM \$${cols.length + 2}
                       AND sale_price IS NOT DISTINCT FROM \$${cols.length + 3}
                       AND source_name = \$${cols.length + 4}
                   )`;
    queries.push(previewSql.query(query, [...vals, r.sale_address, r.sale_date, r.sale_price, r.source_name]));
  }

  // D. census_sa2_data
  // Preview 只有 8 列：sa2_code, g01, g02, g33, g36, g37, g40, g41
  // 必填字段：sa2_code, g01, g02, g36, g37 → 缺失则抛出 CENSUS_REQUIRED_DATA_MISSING
  // 可选字段：g33, g40, g41 → 缺失写 NULL
  for (const r of census) {
    if (!r.sa2_code) {
      throw Object.assign(new Error('sa2_code is required'), { code: 'CENSUS_REQUIRED_DATA_MISSING' });
    }
    if (r.g01 == null) {
      throw Object.assign(new Error('g01 is required'), { code: 'CENSUS_REQUIRED_DATA_MISSING' });
    }
    if (r.g02 == null) {
      throw Object.assign(new Error('g02 is required'), { code: 'CENSUS_REQUIRED_DATA_MISSING' });
    }
    if (r.g36 == null) {
      throw Object.assign(new Error('g36 is required'), { code: 'CENSUS_REQUIRED_DATA_MISSING' });
    }
    if (r.g37 == null) {
      throw Object.assign(new Error('g37 is required'), { code: 'CENSUS_REQUIRED_DATA_MISSING' });
    }
    const vals = [
      r.sa2_code,
      r.g01,
      r.g02,
      r.g33 ?? null,
      r.g36,
      r.g37,
      r.g40 ?? null,
      r.g41 ?? null,
    ];
    const query = `INSERT INTO census_sa2_data (sa2_code, g01, g02, g33, g36, g37, g40, g41)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                   ON CONFLICT (sa2_code) DO NOTHING`;
    queries.push(previewSql.query(query, vals));
  }

  return queries;
}

// ================================================================

// ================================================================
// diagnoseWrite — 分类诊断写入能力（不持久化）
//
// 使用真实 sql 连接构建查询并逐类执行独立事务。
// 每类事务包含该类的 INSERT 查询 + sentinel (SELECT 1/0)。
// school_profiles 需要先插入对应的 school_locations row（FK）。
// 任何分类都不得留下数据 — sentinel 迫使整个事务 rollback。
// 输出仅 safe 字段：category + result + code（SQLSTATE）
// ================================================================
export async function diagnoseWrite(sql) {
  const results = [];
  const categories = [
    'school_locations',
    'school_profiles',
    'comparable_sales',
    'census_sa2_data',
  ];

  // 安全合法的测试行（acara_sml_id 用安全负整数，sa2_code 用合法9位数字）
  const DIAG_LOCATION = {
    calendar_year: 2024, acara_sml_id: -99999,
    location_age_id: null, school_age_id: null,
    rolled_school_id: null, school_name: 'DIAG_TEST_SCHOOL',
    suburb: 'DIAGTEST', state: 'VIC', postcode: '3000',
    school_sector: 'DIAGNOSTIC', school_type: null, special_school: null,
    campus_type: null, latitude: null, longitude: null,
    abs_remoteness_area: null, abs_remoteness_name: null,
    meshblock: null, sa1: null, sa2_code: '299999999',
    sa2_name: null, sa3_code: null, sa3_name: null,
    sa4_code: null, sa4_name: null, lga_code: null, lga_name: null,
    state_electoral_code: null, state_electoral_name: null,
    commonwealth_electoral_code: null, commonwealth_electoral_name: null,
  };

  const DIAG_PROFILE = {
    calendar_year: 2024, acara_sml_id: -99999,
    location_age_id: null, school_age_id: null,
    school_name: 'DIAG_TEST_SCHOOL', suburb: 'DIAGTEST',
    state: 'VIC', postcode: '3000',
    school_sector: 'DIAGNOSTIC', school_type: null, campus_type: null,
    rolled_reporting_description: null, school_url: null,
    governing_body: null, governing_body_url: null,
    year_range: null, geolocation: null,
    icsea: null, icsea_percentile: null,
    bottom_sea_quarter_pct: null, lower_middle_sea_quarter_pct: null,
    upper_middle_sea_quarter_pct: null, top_sea_quarter_pct: null,
    teaching_staff: null, fte_teaching_staff: null,
    non_teaching_staff: null, fte_non_teaching_staff: null,
    total_enrolments: null, girls_enrolments: null,
    boys_enrolments: null, fte_enrolments: null,
    indigenous_enrolments_pct: null,
    lbote_yes_pct: null, lbote_no_pct: null, lbote_not_stated_pct: null,
  };

  const DIAG_COMP = {
    sale_address: '__DIAG_COMP_1__', sale_price: 1, sale_date: '2024-01-01',
    property_type: 'house', bedrooms: null, bathrooms: null,
    car_spaces: null, land_size_sqm: null, building_area_sqm: null,
    suburb: 'DIAGTEST', state: 'VIC', postcode: null,
    sa2_code: null, sa2_name: null, lat: null, lon: null,
    source_url: 'https://test.diag', source_name: 'diag',
    raw_price_text: null, collection_date: '2024-01-01',
    collection_round: null, batch_id: null,
    verification_status: null, original_evidence: null,
  };

  const DIAG_CENSUS = {
    sa2_code: '299999999',
    g01: { total: 1 }, g02: { total: 1 },
    g33: null, g36: { median_rent: 1 }, g37: { median_rent: 1 },
    g40: null, g41: null,
  };

  for (const catName of categories) {
    let queries;

    try {
      if (catName === 'school_locations') {
        // Single INSERT + sentinel
        queries = buildPreviewQueries(sql, {
          schools: [DIAG_LOCATION],
          profiles: [], comps: [], extraComps: [], census: [],
        });
      } else if (catName === 'school_profiles') {
        // FK dependency: parent location first, then profile, then sentinel
        queries = buildPreviewQueries(sql, {
          schools: [DIAG_LOCATION],
          profiles: [DIAG_PROFILE],
          comps: [], extraComps: [], census: [],
        });
      } else if (catName === 'comparable_sales') {
        queries = buildPreviewQueries(sql, {
          schools: [], profiles: [],
          comps: [DIAG_COMP], extraComps: [], census: [],
        });
      } else if (catName === 'census_sa2_data') {
        queries = buildPreviewQueries(sql, {
          schools: [], profiles: [],
          comps: [], extraComps: [],
          census: [DIAG_CENSUS],
        });
      } else {
        throw Object.assign(new Error('unknown category'), { code: 'UNKNOWN_CATEGORY' });
      }

      // Validate: must have at least 1 real INSERT before sentinel
      if (queries.length < 1) {
        results.push({ category: catName, result: 'failed', code: 'NO_QUERIES' });
        continue;
      }

    } catch (buildErr) {
      results.push({ category: catName, result: 'failed', code: buildErr.code || 'unknown' });
      continue;
    }

    // Add sentinel as the LAST query — division by zero forces rollback
    queries.push(sql`SELECT 1/0`);

    try {
      await sql.transaction(queries, { fullResults: true });
      results.push({ category: catName, result: 'failed', code: 'SENTINEL_DID_NOT_FAIL' });
    } catch (txErr) {
      // Only SQLSTATE 22012 identifies a sentinel rollback
      // Never read txErr.message, never output it
      const isSentinel = txErr.code === '22012';
      if (isSentinel) {
        results.push({ category: catName, result: 'pass_rolled_back' });
      } else {
        results.push({ category: catName, result: 'failed', code: typeof txErr.code === 'string' ? txErr.code : 'unknown' });
      }
    }
  }

  return results;
}

// countResults — 按表统计实际插入行数
// school_profiles 无 ON CONFLICT，但 WHERE NOT EXISTS 不会插入重复，
// 所以 rowCount=0 表示已存在，不计入。
// ================================================================
export function countResults(data, results) {
  const { schools, profiles, comps, extraComps, census } = data;

  const compMap = new Map();
  for (const c of comps) compMap.set(c.sale_address?.toLowerCase(), c);
  for (const ec of extraComps) {
    if (!compMap.has(ec.sale_address?.toLowerCase())) compMap.set(ec.sale_address?.toLowerCase(), ec);
  }
  const combinedComps = [...compMap.values()];

  let si = 0;
  let sl = 0, sp = 0, cs = 0, ce = 0;

  for (let i = 0; i < schools.length; i++, si++) {
    if (results[si].rowCount > 0) sl++;
  }
  for (let i = 0; i < profiles.length; i++, si++) {
    if (results[si].rowCount > 0) sp++;
  }
  for (let i = 0; i < combinedComps.length; i++, si++) {
    if (results[si].rowCount > 0) cs++;
  }
  for (let i = 0; i < census.length; i++, si++) {
    if (results[si].rowCount > 0) ce++;
  }

  return {
    school_locations: sl,
    school_profiles: sp,
    comparable_sales: cs,
    census_sa2_data: ce,
  };
}
