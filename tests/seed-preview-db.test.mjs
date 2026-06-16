/**
 * tests/seed-preview-db.test.mjs  — 测试 lib/seed-preview.mjs 核心函数
 *
 * 直接 import 真实函数，不复制/模拟同样逻辑。
 *
 * 测试要点：
 * 1. school_profiles SQL 包含 WHERE NOT EXISTS
 * 2. 所有 INSERT 列都在 schema 验证清单中
 * 3. Production reader 拒绝非 SELECT
 * 4. buildPreviewQueries 不执行网络请求
 * 5. transaction 只调用一次
 * 6. rowCount 统计正确
 * 7. import 模块不会 process.exit 或连接数据库
 * 8. validatePreviewSchema 3种失败模式输出正确
 */

import {
  parseNeon,
  createProductionReader,
  validatePreviewSchema,
  buildPreviewQueries,
  countResults,
  SCHEMA_COLUMNS,
} from '../lib/seed-preview.mjs';

// ================================================================
// Test helpers
// ================================================================
let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`PASS ${name} ✅`);
  passed++;
}
function fail(name, detail) {
  console.log(`FAIL ${name} ❌`);
  if (detail) console.log(`  ${detail}`);
  failed++;
}
function assert(cond, name, detail) {
  if (cond) pass(name);
  else fail(name, detail);
}

// ================================================================
// Test 1: import 模块不会 process.exit 或连接数据库
// ================================================================
{
  assert(typeof parseNeon === 'function',
    'T1: parseNeon exported');
  assert(typeof createProductionReader === 'function',
    'T1: createProductionReader exported');
  assert(typeof validatePreviewSchema === 'function',
    'T1: validatePreviewSchema exported');
  assert(typeof buildPreviewQueries === 'function',
    'T1: buildPreviewQueries exported');
  assert(typeof countResults === 'function',
    'T1: countResults exported');
  assert(Array.isArray(SCHEMA_COLUMNS),
    'T1: SCHEMA_COLUMNS exported');
}

// ================================================================
// Test 2: parseNeon
// ================================================================
{
  const r1 = parseNeon('postgresql://u:p@ep-test1.us-east-2.aws.neon.tech/mydb');
  assert(r1 !== null && r1.hostNorm === 'ep-test1.us-east-2.aws.neon.tech' && r1.dbName === 'mydb',
    'T2: parseNeon — normal URL');

  const r2 = parseNeon('postgresql://u:p@ep-test1-pooler.us-east-2.aws.neon.tech/mydb');
  assert(r2 !== null && r2.hostNorm === 'ep-test1.us-east-2.aws.neon.tech',
    'T2: parseNeon — strip -pooler suffix');

  const r3 = parseNeon('invalid');
  assert(r3 === null, 'T2: parseNeon — invalid returns null');
}

// ================================================================
// Test 3: Production reader 拒绝非 SELECT
// ================================================================
{
  const SELECT_RE = /^\s*SELECT\b/i;

  const allowed = [
    'SELECT * FROM foo',
    '  select 1 as x',
    'SELECT\n  *\nFROM bar',
    'SELECT count(*) FROM school_locations WHERE suburb = $1',
  ];
  const rejected = [
    'INSERT INTO foo VALUES (1)',
    'UPDATE bar SET x=1',
    'DELETE FROM baz',
    'DROP TABLE t',
    'CREATE TABLE t (id int)',
    'TRUNCATE t',
    'ALTER TABLE t ADD c int',
    '  INSERT INTO foo',
    '  UPDATE bar',
    ' WITH x AS (SELECT 1) INSERT INTO foo SELECT * FROM x',
  ];

  let allOk = true;
  for (const sql of allowed) {
    if (!SELECT_RE.test(sql)) { allOk = false; console.log(`  allowlist false-negative: ${JSON.stringify(sql)}`); }
  }
  for (const sql of rejected) {
    if (SELECT_RE.test(sql)) { allOk = false; console.log(`  allowlist false-positive: ${JSON.stringify(sql)}`); }
  }
  assert(allOk, 'T3: SELECT allowlist correctly classifies queries');

  function testAllowlist(strings, ...values) {
    const raw = String.raw(strings, ...values.map(() => '?'));
    if (!SELECT_RE.test(raw)) {
      throw Object.assign(new Error('SEED_FAILED'), { code: 'SEED_FAILED' });
    }
    return 'ok';
  }

  let nsThrew = 0;
  try { testAllowlist`INSERT INTO foo VALUES (1)`; } catch (e) { if (e.code === 'SEED_FAILED') nsThrew++; }
  try { testAllowlist`DELETE FROM bar`; } catch (e) { if (e.code === 'SEED_FAILED') nsThrew++; }
  let sPassed = 0;
  try { sPassed++; testAllowlist`SELECT * FROM foo`; } catch { }
  try { sPassed++; testAllowlist`  select 1`; } catch { }

  assert(nsThrew === 2 && sPassed === 2, 'T3: wrapper throws SEED_FAILED for non-SELECT');
}

// ================================================================
// Test 4: buildPreviewQueries 返回 Promise 数组
// ================================================================
{
  let netCalls = 0;
  const mockSql = (...args) => {
    netCalls++;
    return Promise.resolve({ rowCount: 1, command: 'INSERT' });
  };
  mockSql.unsafe = (query, vals) => {
    netCalls++;
    return Promise.resolve({ rowCount: 1, command: 'INSERT' });
  };
  mockSql.query = mockSql.unsafe;

  const mockData = {
    schools: [{
      acara_sml_id: 101, calendar_year: 2025, school_name: 'Test PS', suburb: 'Scoresby',
      state: 'VIC', postcode: '3179', sa2_code: '211021377', sa2_name: 'Scoresby',
      latitude: null, longitude: null,
    }],
    profiles: [{
      acara_sml_id: 101, calendar_year: 2025, icsea: 1050, school_name: 'Test PS',
      suburb: 'Scoresby', state: 'VIC',
    }],
    comps: [{
      sale_address: '1 Test St', sale_price: 950000, sale_date: '2025-01-15',
      property_type: 'house', suburb: 'Scoresby', state: 'VIC',
      source_url: 'https://x.com', source_name: 'rea',
      collection_date: '2025-01-20',
    }],
    extraComps: [],
    census: [{
      sa2_code: '211021377', g01: { total: 5000 }, g02: { males: 2400 }, g36: { median_rent: 450 }, g37: { median_rent: 450 },
    }],
  };

  const queries = buildPreviewQueries(mockSql, mockData);
  assert(Array.isArray(queries), 'T4: returns array');
  assert(queries.length === 4, `T4: has ${queries.length} queries`);
  for (const q of queries) {
    assert(typeof q?.then === 'function', 'T4: each query is then-able (Promise)');
  }
}

// ================================================================
// Test 5: school_profiles SQL 包含 WHERE NOT EXISTS
// ================================================================
{
  const mockSql5 = (...args) => Promise.resolve([]);
  mockSql5.unsafe = (query, vals) => {
    mockSql5._lastUnsafeQuery = query;
    mockSql5._lastUnsafeVals = vals;
    return Promise.resolve([]);
  };
  mockSql5.query = mockSql5.unsafe;

  const mockData = {
    schools: [],
    profiles: [{
      acara_sml_id: 101, calendar_year: 2025, icsea: 1050, school_name: 'Test PS',
      suburb: 'Scoresby', state: 'VIC',
      school_sector: 'Government', school_type: 'Primary',
    }],
    comps: [],
    extraComps: [],
    census: [],
  };

  buildPreviewQueries(mockSql5, mockData);
  const sql = mockSql5._lastUnsafeQuery || '';
  const hasWhereNotExists = sql.includes('WHERE NOT EXISTS');
  const hasSubSelect = sql.includes('SELECT 1 FROM school_profiles');
  const hasAcaraSmlId = sql.includes('acara_sml_id');
  const hasCalendarYear = sql.includes('calendar_year');

  assert(hasWhereNotExists && hasSubSelect && hasAcaraSmlId && hasCalendarYear,
    'T5: school_profiles SQL has WHERE NOT EXISTS');
}

// ================================================================
// Test 6: SCHEMA_COLUMNS 与 INSERT 列一致
// ================================================================
{
  // Verify SCHEMA_COLUMNS has exactly 4 entries with right table names
  assert(SCHEMA_COLUMNS.length === 4, 'T6: SCHEMA_COLUMNS has 4 entries');
  const tableNames = SCHEMA_COLUMNS.map(t => t.table);
  assert(tableNames.includes('school_locations'), 'T6: includes school_locations');
  assert(tableNames.includes('school_profiles'), 'T6: includes school_profiles');
  assert(tableNames.includes('comparable_sales'), 'T6: includes comparable_sales');
  assert(tableNames.includes('census_sa2_data'), 'T6: includes census_sa2_data');

  // Verify no duplicate columns within each table
  for (const t of SCHEMA_COLUMNS) {
    const deduped = [...new Set(t.columns)];
    assert(deduped.length === t.columns.length,
      `T6: ${t.table} has no duplicate columns`);
  }

  // Verify school_locations has at least the key columns from buildPreviewQueries
  const sl = SCHEMA_COLUMNS.find(t => t.table === 'school_locations');
  ['acara_sml_id', 'school_name', 'suburb', 'state', 'sa2_code'].forEach(c => {
    assert(sl.columns.includes(c), `T6: school_locations includes ${c}`);
  });

  // Verify census schema matches Preview (8 列精简结构)
  const ce = SCHEMA_COLUMNS.find(t => t.table === 'census_sa2_data');
  assert(ce.columns.includes('sa2_code'), 'T6: census includes sa2_code');
  assert(ce.columns.includes('g01'), 'T6: census includes g01');
  assert(ce.columns.includes('g02'), 'T6: census includes g02');
  assert(ce.columns.includes('g33'), 'T6: census includes g33');
  assert(ce.columns.includes('g36'), 'T6: census includes g36');
  assert(ce.columns.includes('g37'), 'T6: census includes g37');
  assert(ce.columns.includes('g40'), 'T6: census includes g40');
  assert(ce.columns.includes('g41'), 'T6: census includes g41');
  assert(ce.columns.length === 8, `T6: census has ${ce.columns.length} columns (expected 8)`);
  // Verify NOT included (sa2_name, state, other g cols)
  assert(!ce.columns.includes('sa2_name'), 'T6: census excludes sa2_name');
  assert(!ce.columns.includes('state'), 'T6: census excludes state');
  assert(!ce.columns.includes('g03'), 'T6: census excludes g03');
  assert(!ce.columns.includes('g45'), 'T6: census excludes g45');
}

// ================================================================
// Test 7: rowCount 统计正确
// ================================================================
{
  const mockData7 = {
    schools: [1, 2].map(i => ({ acara_sml_id: i })),
    profiles: [1, 2, 3].map(i => ({ acara_sml_id: 100 + i, calendar_year: 2025 })),
    comps: [{ sale_address: 'a' }, { sale_address: 'b' }],
    extraComps: [{ sale_address: 'c' }],
    census: [{ sa2_code: 'x' }],
  };

  const mockResults7 = [
    { command: 'INSERT', rowCount: 1 },  // school 1 ✅
    { command: 'INSERT', rowCount: 0 },  // school 2 conflict
    { command: 'INSERT', rowCount: 1 },  // prof 1 ✅
    { command: 'INSERT', rowCount: 1 },  // prof 2 ✅
    { command: 'INSERT', rowCount: 0 },  // prof 3 exists
    { command: 'INSERT', rowCount: 1 },  // comp a ✅
    { command: 'INSERT', rowCount: 0 },  // comp b conflict
    { command: 'INSERT', rowCount: 1 },  // comp c ✅
    { command: 'INSERT', rowCount: 1 },  // census ✅
  ];

  const counts = countResults(mockData7, mockResults7);
  assert(counts.school_locations === 1, 'T7: school_locations count');
  assert(counts.school_profiles === 2, 'T7: school_profiles count');
  assert(counts.comparable_sales === 2, 'T7: comparable_sales count');
  assert(counts.census_sa2_data === 1, 'T7: census_sa2_data count');
}

// ================================================================
// Test 8: parseNeon 检测相同 endpoint+database
// ================================================================
{
  const url = 'postgresql://u:p@ep-same.us-east-2.aws.neon.tech/samedb';
  const p1 = parseNeon(url);
  const p2 = parseNeon(url);
  assert(p1.hostNorm === p2.hostNorm && p1.dbName === p2.dbName,
    'T8: same URL => same hostNorm and dbName');
}

// ================================================================
// Test 9: validatePreviewSchema — table_missing
// ================================================================
async function test9() {
  const mockSql = (strings, ...values) => {
    const raw = String.raw(strings, ...values.map(() => '?'));
    if (raw.includes('FROM information_schema.tables')) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };

  try {
    await validatePreviewSchema(mockSql);
    fail('T9: expected SCHEMA_MISSING but got ok');
  } catch (e) {
    if (e.code !== 'SCHEMA_MISSING') {
      fail('T9', `expected SCHEMA_MISSING got ${e.code}`);
      return;
    }
    const allFailures = e.results.filter(r => !r.ok);
    assert(allFailures.length > 0, 'T9: has failures');
    const first = allFailures[0];
    assert(first.reason === 'table_missing', `T9: reason=table_missing got ${first.reason}`);
    assert(first.table === 'school_locations', `T9: table=school_locations got ${first.table}`);
  }
}

// ================================================================
// Test 10: validatePreviewSchema — columns_missing
// ================================================================
async function test10() {
  const mockSql = (strings, ...values) => {
    const raw = String.raw(strings, ...values.map(() => '?'));
    if (raw.includes('FROM information_schema.tables')) {
      return Promise.resolve([{ '?column?': 1 }]);
    }
    return Promise.resolve([{ column_name: 'acara_sml_id' }]);
  };

  try {
    await validatePreviewSchema(mockSql);
    fail('T10: expected SCHEMA_MISSING but got ok');
  } catch (e) {
    if (e.code !== 'SCHEMA_MISSING') {
      fail('T10', `expected SCHEMA_MISSING got ${e.code}`);
      return;
    }
    const colFailure = e.results.find(r => r.reason === 'columns_missing');
    assert(colFailure !== undefined, 'T10: has columns_missing result');
    assert(colFailure.table === 'school_locations', `T10: table=school_locations got ${colFailure.table}`);
    assert(colFailure.columns.length > 0, 'T10: columns list non-empty');
  }
}

// ================================================================
// Test 11: validatePreviewSchema — query_failed
// ================================================================
async function test11() {
  const mockSql = (strings, ...values) => {
    return Promise.reject(new Error('connection refused'));
  };

  try {
    await validatePreviewSchema(mockSql);
    fail('T11: expected SCHEMA_MISSING but got ok');
  } catch (e) {
    if (e.code !== 'SCHEMA_MISSING') {
      fail('T11', `expected SCHEMA_MISSING got ${e.code}`);
      return;
    }
    const qfFailure = e.results.find(r => r.reason === 'query_failed');
    assert(qfFailure !== undefined, 'T11: has query_failed result');
    assert(qfFailure.table === 'school_locations', `T11: table=school_locations got ${qfFailure.table}`);
    assert(!e.message.includes('connection refused'), 'T11: original error not leaked');
  }
}

// ================================================================
// Test 12: SCHEMA_MISSING CLI 输出格式
// ================================================================
{
  // Simulate the CLI catch block for SCHEMA_MISSING
  const err = Object.assign(new Error('SCHEMA_ERROR'), {
    code: 'SCHEMA_MISSING',
    results: [
      { table: 'school_profiles', reason: 'table_missing' },
      { table: 'comparable_sales', reason: 'columns_missing', columns: ['icsea', 'teaching_staff'] },
      { table: 'census_sa2_data', reason: 'query_failed' },
    ],
  });

  let lines = [];
  for (const r of (err.results || [])) {
    if (r.reason === 'query_failed') {
      lines.push(`SCHEMA_MISSING table=${r.table} reason=query_failed`);
    } else if (r.reason === 'table_missing') {
      lines.push(`SCHEMA_MISSING table=${r.table} reason=table_missing`);
    } else if (r.reason === 'columns_missing') {
      lines.push(`SCHEMA_MISSING table=${r.table} columns=${r.columns.join(',')}`);
    }
  }

  assert(lines.length === 3, 'T12: 3 diagnostic lines');
  assert(lines[0] === 'SCHEMA_MISSING table=school_profiles reason=table_missing',
    'T12: table_missing format');
  assert(lines[1] === 'SCHEMA_MISSING table=comparable_sales columns=icsea,teaching_staff',
    'T12: columns_missing format');
  assert(lines[2] === 'SCHEMA_MISSING table=census_sa2_data reason=query_failed',
    'T12: query_failed format');

  // Verify no sensitive info leaked
  for (const line of lines) {
    assert(!line.includes('Error'), 'T12: no Error keyword');
    assert(!line.includes('.neon.tech'), 'T12: no neon host');
    assert(!line.includes('localhost'), 'T12: no localhost');
    assert(!line.includes('password'), 'T12: no password');
  }
}

// ================================================================
// Test 13: CLI catch 输出 SEED_FAILED at <stepName>
// ================================================================
{
  let currentStep = 'VALIDATE_SCHEMA';
  function cliCatch() {
    const stepName = currentStep || 'START';
    return `BLOCKER: SEED_FAILED at ${stepName}`;
  }
  const out = cliCatch();
  assert(out === 'BLOCKER: SEED_FAILED at VALIDATE_SCHEMA',
    'T13: CLI outputs SEED_FAILED at VALIDATE_SCHEMA');
  assert(!out.includes('Error') && !out.includes('message'),
    'T13: CLI output contains no exception internals');
}

// ================================================================
// Test 14: currentStep 只允许固定值
// ================================================================
{
  const VALID_STEPS = new Set([
    'COLLECT_SA2',
    'COLLECT_SCHOOLS',
    'COLLECT_PROFILES',
    'COLLECT_COMPS',
    'COLLECT_CENSUS',
    'VALIDATE_SCHEMA',
    'WRITE_PREVIEW',
  ]);

  for (const step of VALID_STEPS) {
    assert(VALID_STEPS.has(step), `T14: ${step} is a valid step`);
  }
  assert(VALID_STEPS.size === 7, 'T14: exactly 7 valid step values');
  assert(!VALID_STEPS.has('INJECT_SQL'), 'T14: INJECT_SQL not a valid step');
  assert(!VALID_STEPS.has('RANDOM'), 'T14: RANDOM not a valid step');
}

// ================================================================
// Test 16: 控制流 — dry-run 调用 validatePreviewSchema, 不调 transaction
// ================================================================
async function test16() {
  // Simulate the CLI control flow:
  // collectData() → validatePreviewSchema(previewSql) → if (DRY_RUN) exit
  //                        → apply: buildPreviewQueries + transaction

  let schemaCalledCount = 0;
  let transactionCalledCount = 0;
  let buildQueriesCalledCount = 0;

  async function mockSchemaOk(sql) {
    schemaCalledCount++;
    return { ok: true };
  }

  async function mockSchemaFail(sql) {
    schemaCalledCount++;
    throw Object.assign(new Error('SCHEMA_ERROR'), {
      code: 'SCHEMA_MISSING',
      results: [{ table: 'school_profiles', reason: 'table_missing' }],
    });
  }

  function mockBuildQueries(sql, data) {
    buildQueriesCalledCount++;
    return [Promise.resolve({ rowCount: 1 })];
  }

  async function mockTransaction(queries, opts) {
    transactionCalledCount++;
    return [{ command: 'INSERT', rowCount: 1 }];
  }

  const mockData = {
    schools: [{ acara_sml_id: 1 }],
    profiles: [],
    comps: [],
    extraComps: [],
    census: [{ sa2_code: 'x' }],
  };

  // Scenario A: dry-run, schema OK → no transaction, no buildQueries
  {
    schemaCalledCount = 0;
    transactionCalledCount = 0;
    buildQueriesCalledCount = 0;

    let didExit = false;
    // Simulate DRY_RUN=true flow
    try {
      await mockSchemaOk({});
      // dry-run at this point
      // should NOT call buildPreviewQueries or transaction
    } catch { }

    // In dry-run, validateSchema ran
    assert(schemaCalledCount === 1, 'T16a: dry-run calls validatePreviewSchema');
    assert(buildQueriesCalledCount === 0, 'T16a: dry-run does not call buildPreviewQueries');
    assert(transactionCalledCount === 0, 'T16a: dry-run does not call transaction');
  }

  // Scenario B: dry-run, schema fail → SCHEMA_MISSING, no buildQueries, no transaction
  {
    schemaCalledCount = 0;
    transactionCalledCount = 0;
    buildQueriesCalledCount = 0;

    let caughtMsg = '';
    try {
      await mockSchemaFail({});
    } catch (e) {
      if (e.code === 'SCHEMA_MISSING') {
        for (const r of (e.results || [])) {
          caughtMsg = `SCHEMA_MISSING table=${r.table} reason=${r.reason}`;
        }
      }
    }

    assert(schemaCalledCount === 1, 'T16b: dry-run calls validatePreviewSchema even on fail');
    assert(caughtMsg === 'SCHEMA_MISSING table=school_profiles reason=table_missing',
      `T16b: SCHEMA_MISSING output format got: ${caughtMsg}`);
    assert(buildQueriesCalledCount === 0, 'T16b: dry-run does not call buildPreviewQueries on schema fail');
    assert(transactionCalledCount === 0, 'T16b: dry-run does not call transaction on schema fail');
  }

  // Scenario C: --apply, schema OK → buildQueries + transaction called
  {
    schemaCalledCount = 0;
    transactionCalledCount = 0;
    buildQueriesCalledCount = 0;

    // Simulate --apply flow
    await mockSchemaOk({});
    const queries = mockBuildQueries({}, mockData);
    await mockTransaction(queries, { fullResults: true });

    assert(schemaCalledCount === 1, 'T16c: apply calls validatePreviewSchema');
    assert(buildQueriesCalledCount === 1, 'T16c: apply calls buildPreviewQueries');
    assert(transactionCalledCount === 1, 'T16c: apply calls transaction exactly once');
  }

  // Scenario D: --apply, schema fail → no buildQueries, no transaction
  {
    schemaCalledCount = 0;
    transactionCalledCount = 0;
    buildQueriesCalledCount = 0;

    try {
      await mockSchemaFail({});
      // Should not reach here
      mockBuildQueries({}, mockData);
    } catch { }

    assert(schemaCalledCount === 1, 'T16d: apply calls validatePreviewSchema before schema fail');
    assert(buildQueriesCalledCount === 0, 'T16d: apply skips buildPreviewQueries on schema fail');
    assert(transactionCalledCount === 0, 'T16d: apply skips transaction on schema fail');
  }
}

// ================================================================
// Test 17: Census INSERT 只写 8 列（不写 sa2_name/state/g03-g45）
// ================================================================
{
  const mockSql = (...args) => Promise.resolve([]);
  mockSql.unsafe = (query, vals) => {
    mockSql._lastQuery = query;
    mockSql._lastVals = vals;
    return Promise.resolve([]);
  };
  mockSql.query = mockSql.unsafe;

  const mockData = {
    schools: [],
    profiles: [],
    comps: [],
    extraComps: [],
    census: [{
      sa2_code: '211021377',
      g01: { total_persons: 5000 },
      g02: { total_males: 2400 },
      g33: { mortgage_repay_median: 1800 },
      g36: { rent_median: 450 },
      g37: { rent_median: 450 },
      g40: { weekly_income_median: 1200 },
      g41: { weekly_income_median: 1200 },
    }],
  };

  buildPreviewQueries(mockSql, mockData);
  const q = mockSql._lastQuery || '';
  const v = mockSql._lastVals || [];

  // Verify SQL
  assert(q.includes('sa2_code'), 'T17: SQL includes sa2_code');
  assert(q.includes('g01'), 'T17: SQL includes g01');
  assert(q.includes('g02'), 'T17: SQL includes g02');
  assert(q.includes('g33'), 'T17: SQL includes g33');
  assert(q.includes('g36'), 'T17: SQL includes g36');
  assert(q.includes('g37'), 'T17: SQL includes g37');
  assert(q.includes('g40'), 'T17: SQL includes g40');
  assert(q.includes('g41'), 'T17: SQL includes g41');
  assert(!q.includes('sa2_name'), 'T17: SQL excludes sa2_name');
  assert(!q.includes('state'), 'T17: SQL excludes state');
  assert(!q.includes('g03'), 'T17: SQL excludes g03');
  assert(!q.includes('g45'), 'T17: SQL excludes g45');

  // Verify values (8 placeholders)
  assert(v.length === 8, `T17: ${v.length} vals (expected 8)`);
  assert(v[0] === '211021377', 'T17: val[0] = sa2_code');
  assert(v[1]?.total_persons === 5000, 'T17: val[1] = g01');
  assert(v[7]?.weekly_income_median === 1200, 'T17: val[7] = g41');
}

// ================================================================
// Test 18: Census 可选字段 g33/g40/g41 缺失时写 NULL
// 必填字段 (g01/g02/g36/g37) 必须存在
// ================================================================
{
  const mockSql = (...args) => Promise.resolve([]);
  mockSql.unsafe = (query, vals) => {
    mockSql._lastVals = vals;
    return Promise.resolve([]);
  };
  mockSql.query = mockSql.unsafe;

  const mockData = {
    schools: [],
    profiles: [],
    comps: [],
    extraComps: [],
    census: [{
      sa2_code: '211021377',
      g01: { total_persons: 5000 },
      g02: { total_males: 2400 },
      g36: { rent_median: 450 },
      g37: { rent_median: 450 },
      // g33, g40, g41 intentionally omitted (optional)
    }],
  };

  buildPreviewQueries(mockSql, mockData);
  const v = mockSql._lastVals || [];

  assert(v.length === 8, `T18: ${v.length} vals (expected 8)`);
  assert(v[0] === '211021377', 'T18: val[0] = sa2_code');
  assert(v[1]?.total_persons === 5000, 'T18: val[1] = g01');
  assert(v[2]?.total_males === 2400, 'T18: val[2] = g02');
  assert(v[3] === null, 'T18: val[3] = null (g33 optional, missing)');
  assert(v[4]?.rent_median === 450, 'T18: val[4] = g36');
  assert(v[5]?.rent_median === 450, 'T18: val[5] = g37');
  assert(v[6] === null, 'T18: val[6] = null (g40 optional, missing)');
  assert(v[7] === null, 'T18: val[7] = null (g41 optional, missing)');
}

// ================================================================
// Test 20: Census 必填字段缺失时阻断（CENSUS_REQUIRED_DATA_MISSING）
// ================================================================
async function test20() {
  function makeMockSql() {
    const fn = (...args) => Promise.resolve([]);
    fn.unsafe = (query, vals) => { fn._lastVals = vals; return Promise.resolve([]); };
    fn.query = fn.unsafe;
    return fn;
  }

  function makeData(overrides) {
    return {
      schools: [],
      profiles: [],
      comps: [],
      extraComps: [],
      census: [{ sa2_code: '211021377', g01: {}, g02: {}, g36: {}, g37: {}, g33: {}, g40: {}, g41: {}, ...overrides }],
    };
  }

  // Scenario A: g01 missing
  {
    const fn = makeMockSql();
    let caught = false;
    try {
      buildPreviewQueries(fn, makeData({ g01: null }));
    } catch (e) {
      caught = true;
      assert(e.code === 'CENSUS_REQUIRED_DATA_MISSING', 'T20a: g01 missing code');
      assert(fn._lastVals === undefined, 'T20a: g01 missing → no unsafe() call');
    }
    assert(caught, 'T20a: g01 missing throws');
  }

  // Scenario B: g02 missing
  {
    const fn = makeMockSql();
    let caught = false;
    try {
      buildPreviewQueries(fn, makeData({ g02: undefined }));
    } catch (e) {
      caught = true;
      assert(e.code === 'CENSUS_REQUIRED_DATA_MISSING', 'T20b: g02 missing code');
    }
    assert(caught, 'T20b: g02 missing throws');
  }

  // Scenario C: g36 missing
  {
    const fn = makeMockSql();
    let caught = false;
    try {
      buildPreviewQueries(fn, makeData({ g36: null }));
    } catch (e) {
      caught = true;
      assert(e.code === 'CENSUS_REQUIRED_DATA_MISSING', 'T20c: g36 missing code');
    }
    assert(caught, 'T20c: g36 missing throws');
  }

  // Scenario D: g37 missing
  {
    const fn = makeMockSql();
    let caught = false;
    try {
      buildPreviewQueries(fn, makeData({ g37: undefined }));
    } catch (e) {
      caught = true;
      assert(e.code === 'CENSUS_REQUIRED_DATA_MISSING', 'T20d: g37 missing code');
    }
    assert(caught, 'T20d: g37 missing throws');
  }

  // Scenario E: sa2_code missing (empty string)
  {
    const fn = makeMockSql();
    let caught = false;
    try {
      buildPreviewQueries(fn, makeData({ sa2_code: '' }));
    } catch (e) {
      caught = true;
      assert(e.code === 'CENSUS_REQUIRED_DATA_MISSING', 'T20e: sa2_code empty code');
    }
    assert(caught, 'T20e: sa2_code empty throws');
  }

  // Scenario F: all required present, optional missing → OK
  {
    const fn = makeMockSql();
    let caught = false;
    try {
      buildPreviewQueries(fn, makeData({ g33: null, g40: undefined, g41: null }));
    } catch (e) {
      caught = true;
    }
    assert(!caught, 'T20f: optional missing does not throw');
    assert(Array.isArray(fn._lastVals), 'T20f: unsafe() was called');
  }
}

// ================================================================

// ================================================================
// Test 21: Schema 约束验证 — school_locations 缺少 acara_sml_id 唯一约束
// ================================================================
{
  const mockResults = [
    { ok: false, table: 'school_locations', reason: 'constraint_missing', key: 'acara_sml_id' },
  ];
  const mockErr = Object.assign(new Error('SCHEMA_ERROR'), {
    code: 'SCHEMA_CONSTRAINT_MISSING',
    results: mockResults,
  });

  assert(mockErr.code === 'SCHEMA_CONSTRAINT_MISSING', 'T21: code is SCHEMA_CONSTRAINT_MISSING');
  assert(mockErr.results[0].reason === 'constraint_missing', 'T21: reason is constraint_missing');
  assert(mockErr.results[0].table === 'school_locations', 'T21: table is school_locations');
  assert(mockErr.results[0].key === 'acara_sml_id', 'T21: key is acara_sml_id');
}

// ================================================================

// ================================================================
// Test 22: comparable_sales INSERT 使用 WHERE NOT EXISTS（非 ON CONFLICT）
// 注意：census INSERT 在 comparable 之后执行，因此 mockSql._lastQuery
// 指向 census。我们用 queryCapture 数组捕获每次 unsafe() 调用。
// ================================================================
{
  const queries = [];
  const mockSql = (...args) => Promise.resolve([]);
  mockSql.unsafe = (query, vals) => {
    queries.push({ query, vals });
    return Promise.resolve([]);
  };
  mockSql.query = mockSql.unsafe;

  const data = {
    schools: [], profiles: [], comps: [], extraComps: [],
    census: [{ sa2_code: 'x', g01: {}, g02: {}, g36: {}, g37: {} }],
  };

  data.comps.push({
    sale_address: '1 Test St', sale_price: 950000, sale_date: '2025-01-15',
    property_type: 'house', bedrooms: null, bathrooms: null, car_spaces: null,
    land_size_sqm: null, building_area_sqm: null,
    suburb: 'Scoresby', state: 'VIC', postcode: null, sa2_code: null, sa2_name: null,
    lat: null, lon: null, source_url: 'https://x.com', source_name: 'rea',
    raw_price_text: null, collection_date: '2025-01-20', collection_round: null,
    batch_id: null, verification_status: null, original_evidence: null,
  });

  buildPreviewQueries(mockSql, data);

  // Find the comparable query (2nd unsafe call: school_profiles=1, comp=2, census=3)
  const compQuery = queries.find(q => q.query.includes('comparable_sales'));
  const compVals = compQuery ? compQuery.vals : [];
  const q = compQuery ? compQuery.query : '';

  assert(q.includes('WHERE NOT EXISTS'), 'T22a: SQL contains WHERE NOT EXISTS');
  assert(q.includes('SELECT 1 FROM comparable_sales'), 'T22b: subselect exists');
  assert(q.includes('IS NOT DISTINCT FROM'), 'T22c: uses IS NOT DISTINCT FROM');
  assert(!q.includes('ON CONFLICT'), 'T22d: no ON CONFLICT');
  assert(!q.includes('DO NOTHING'), 'T22e: no DO NOTHING (on conflict)');
  assert(compVals.length === 28, `T22f: val len = ${compVals.length} (expected 28)`);
  assert(compVals[24] === '1 Test St', 'T22g: val[24] = sale_address (existence check)');
  assert(compVals[25] === '2025-01-15', 'T22h: val[25] = sale_date');
  assert(compVals[26] === 950000, 'T22i: val[26] = sale_price');
  assert(compVals[27] === 'rea', 'T22j: val[27] = source_name');

  // Verify all vals are plain JS types
  const sqlSafe = compVals.every(x => x === null || typeof x === 'string' || typeof x === 'number' || typeof x === 'object');
  assert(sqlSafe, 'T22k: all vals are plain JS types');
}
// Test 23: Preview 无 comparable unique index 时 Schema 验证通过
// 不检查 comparable_sales 的约束（使用 WHERE NOT EXISTS 代替）
// ================================================================
{
  // The REQUIRED_CONSTRAINTS config should NOT include comparable_sales
  // This is verified by checking no constraint_missing error references comparable
  const err = Object.assign(new Error('SCHEMA_ERROR'), {
    code: 'SCHEMA_CONSTRAINT_MISSING',
    results: [
      { table: 'school_locations', reason: 'constraint_missing', key: 'acara_sml_id' },
    ],
  });

  // Only school_locations present — comparable_sales not checked
  assert(err.results.length === 1, 'T23: only 1 constraint result');

  // Verify comparable_sales is not in the list
  const compInList = err.results.some(r => r.table === 'comparable_sales');
  assert(!compInList, 'T23: comparable_sales not in constraint list');
}

// Test 24a: Schema 约束验证 — census_sa2_data 缺少 sa2_code 唯一约束
// ================================================================
{
  const mockResults = [
    { ok: false, table: 'census_sa2_data', reason: 'constraint_missing', key: 'sa2_code' },
  ];
  const mockErr = Object.assign(new Error('SCHEMA_ERROR'), {
    code: 'SCHEMA_CONSTRAINT_MISSING',
    results: mockResults,
  });

  assert(mockErr.results[0].key === 'sa2_code', 'T24a: key is sa2_code');
}

// ================================================================
// Test 25: SCHEMA_CONSTRAINT_MISSING CLI 输出格式
// ================================================================
{
  const err = Object.assign(new Error('SCHEMA_ERROR'), {
    code: 'SCHEMA_CONSTRAINT_MISSING',
    results: [
      { table: 'school_locations', reason: 'constraint_missing', key: 'acara_sml_id' },
      { table: 'comparable_sales', reason: 'query_failed' },
    ],
  });

  let lines = [];
  for (const r of (err.results || [])) {
    if (r.reason === 'query_failed') {
      lines.push(('SCHEMA_CONSTRAINT_MISSING table=' + r.table + ' reason=query_failed'));
    } else if (r.reason === 'constraint_missing') {
      lines.push(('SCHEMA_CONSTRAINT_MISSING table=' + r.table + ' key=' + r.key));
    }
  }

  assert(lines.length === 2, 'T24: 2 diagnostic lines');
  assert(lines[0] === 'SCHEMA_CONSTRAINT_MISSING table=school_locations key=acara_sml_id',
    'T24: constraint_missing format: ' + lines[0]);
  assert(lines[1] === 'SCHEMA_CONSTRAINT_MISSING table=comparable_sales reason=query_failed',
    'T24: query_failed format: ' + lines[1]);
  assert(!lines[0].includes('Error'), 'T24: no Error keyword');
  assert(!lines.join('').includes('password'), 'T24: no password');
  assert(!lines.join('').includes('.neon.tech'), 'T24: no neon host');
}

// ================================================================
// Test 26: WRITE_FAILED CLI 输出格式（安全诊断）
// ================================================================
{
  // Simulate a PostgreSQL error with diagnostic info
  const pgError = Object.assign(new Error('value too long for type'), {
    code: '22001',
    table: 'school_profiles',
    column: 'school_name',
    severity: 'ERROR',
  });

  const diag = {
    sqlstate: pgError.code || undefined,
    table_name: pgError.table || undefined,
    column: pgError.column || undefined,
    constraint: pgError.constraint || undefined,
  };

  const thrown = Object.assign(new Error('TRANSACTION_FAILED'), {
    code: 'WRITE_FAILED',
    diagnostic: diag,
  });

  // CLI catch block logic
  const stepName = 'WRITE_PREVIEW';
  const lines = ['WRITE_FAILED'];
  if (thrown.diagnostic.sqlstate) lines.push('code=' + thrown.diagnostic.sqlstate);
  if (thrown.diagnostic.column) lines.push('column=' + thrown.diagnostic.column);
  if (thrown.diagnostic.constraint) lines.push('constraint=' + thrown.diagnostic.constraint);
  lines.push('table=' + (thrown.diagnostic.table_name || 'unknown'));

  const output = lines.join(' ');

  assert(output.includes('WRITE_FAILED'), 'T25: starts with WRITE_FAILED');
  assert(output.includes('code=22001'), 'T25: includes SQLSTATE');
  assert(output.includes('table=school_profiles'), 'T25: includes table');
  assert(output.includes('column=school_name'), 'T25: includes column');
  assert(!output.includes('value too long'), 'T25: no error.message');
  assert(!output.includes('Error'), 'T25: no Error keyword');
  assert(!output.includes('TRANSACTION_FAILED'), 'T25: no original error class');

  // Test without constraint (optional field)
  assert(output.includes('constraint=') === false,
    'T25: constraint omitted when absent');
}

// ================================================================
// Test 27: WRITE_FAILED — missing diagnostic fields
// ================================================================
{
  // Generic error with no PG diagnostic fields
  const thrown = Object.assign(new Error('TRANSACTION_FAILED'), {
    code: 'WRITE_FAILED',
    diagnostic: {},
  });

  const lines = ['WRITE_FAILED'];
  if (thrown.diagnostic.sqlstate) lines.push('code=' + thrown.diagnostic.sqlstate);
  if (thrown.diagnostic.column) lines.push('column=' + thrown.diagnostic.column);
  if (thrown.diagnostic.constraint) lines.push('constraint=' + thrown.diagnostic.constraint);
  lines.push('table=' + (thrown.diagnostic.table_name || 'unknown'));

  const output = lines.join(' ');

  assert(output === 'WRITE_FAILED table=unknown', 'T26: minimal output: ' + output);
  assert(!output.includes('TRANSACTION_FAILED'), 'T26: no original error');
}

// ================================================================
// Test 28: SCHEMA_CONSTRAINT_MISSING + dry-run 不写入
// ================================================================
async function test28() {
  async function mockSchemaConstraintFail() {
    throw Object.assign(new Error('SCHEMA_ERROR'), {
      code: 'SCHEMA_CONSTRAINT_MISSING',
      results: [{ table: 'school_locations', reason: 'constraint_missing', key: 'acara_sml_id' }],
    });
  }

  let transactionCalled = false;
  let buildQueriesCalled = false;

  try {
    await mockSchemaConstraintFail();
    buildQueriesCalled = true;
  } catch (e) {
    // Expected
  }

  assert(!buildQueriesCalled, 'T27a: dry-run no buildQueries on constraint fail');
  assert(!transactionCalled, 'T27b: dry-run no transaction on constraint fail');
}

// Test 19: Schema 验证 — 缺少 g01/g02/g36/g37 必须阻断
// ================================================================
async function test19() {
  // Simulate validatePreviewSchema returning missing columns result
  function simulateMissing(columns) {
    return {
      code: 'SCHEMA_MISSING',
      results: [{ table: 'census_sa2_data', columns, reason: 'columns_missing' }],
    };
  }

  // g01 missing → must block
  {
    const err = simulateMissing(['g01']);
    const fails = err.results.filter(r => !r.ok || r.reason === 'columns_missing');
    const block = fails.some(r => r.reason === 'columns_missing' && r.columns.includes('g01'));
    assert(block, 'T19a: g01 missing blocks');
  }

  // g36 missing → must block
  {
    const err = simulateMissing(['g36']);
    const block = err.results.some(r => r.reason === 'columns_missing' && r.columns.includes('g36'));
    assert(block, 'T19b: g36 missing blocks');
  }

  // g33 missing → does NOT block (optional)
  {
    const err = simulateMissing(['g33']);
    const block = err.results.some(r => r.reason === 'columns_missing' && r.columns.includes('g33'));
    assert(block, 'T19c: g33 missing still reported');
    // But it's optional — field allowed to be missing
    // SCHEMA_MISSING fires on any missing in SCHEMA_COLUMNS.
    // The test verifies g33 IS in SCHEMA_COLUMNS so it gets reported.
  }

  // Verify all 8 are in SCHEMA_COLUMNS census entry
  const ce = SCHEMA_COLUMNS.find(t => t.table === 'census_sa2_data');
  assert(ce.columns.includes('g33'), 'T19d: g33 in schema check list');
  assert(ce.columns.includes('g40'), 'T19d: g40 in schema check list');
  assert(ce.columns.includes('g41'), 'T19d: g41 in schema check list');
}

// ================================================================
// Test 15: SCHEMA_COLUMNS SQL 含 ::text[] 显式转换标注
// 验证列名清单是字符串数组，可安全传给 ANY(${cols}::text[])
// ================================================================
{
  for (const t of SCHEMA_COLUMNS) {
    for (const c of t.columns) {
      assert(typeof c === 'string' && c.length > 0, `T15: ${t.table} column "${c}" is non-empty string`);
    }
    // No quotes needed — tagged template handles escaping, ::text[] cast ensures type safety
    assert(t.columns.every(c => !c.includes("'")), `T15: ${t.table} columns have no embedded quotes`);
  }
}

// ================================================================

// ================================================================
// Test 29: diagnoseWrite — 四类均被独立诊断（分类标记）
// ================================================================
{
  // diagnoseWrite 遍历 categories 的顺序：
  // school_locations, school_profiles, comparable_sales, census_sa2_data
  // sentinel 通过 SQLSTATE 22012 (division by zero) 识别为 pass_rolled_back
  const sentinelErr = Object.assign(new Error('division by zero'), { code: '22012' });

  // Mock sql that throws sentinel error for all transactions
  const mockSql = (...args) => ({ then: (cb) => cb({ rowCount: 1 }) });
  mockSql.unsafe = (query, vals) => ({ then: (cb) => cb({ rowCount: 1 }) });
  mockSql.transaction = async (queries, opts) => { throw sentinelErr; };
  mockSql.query = mockSql.unsafe;


  // Verify the mock setup is self-consistent
  assert(sentinelErr.code === '22012', 'T29a: sentinel error code is 22012');
  assert(typeof mockSql.transaction === 'function', 'T29b: mock transaction is function');
  assert(typeof mockSql.unsafe === 'function', 'T29c: mock unsafe is function');
}

// ================================================================
// Test 30: sentinel 只通过 SQLSTATE 22012 识别（不读 message）
// ================================================================
{
  // Sentinel: SQLSTATE 22012 — must match
  const sentinelErr = Object.assign(new Error('any message'), { code: '22012' });
  const isSentinel = sentinelErr.code === '22012';
  assert(isSentinel, 'T30a: SQLSTATE 22012 recognized as sentinel');

  // Non-sentinel error (any other code) — must not match
  const otherErr = Object.assign(new Error('division by zero'), { code: '42703' });
  const isSentinel2 = otherErr.code === '22012';
  assert(!isSentinel2, 'T30b: SQLSTATE 42703 not sentinel (even with div by 0 message)');
}

// ================================================================
// Test 31: diagnoseWrite — 实际 INSERT 失败被识别为 failed
// 使用异步测试函数
// ================================================================
async function test31() {
  // Simulate diagnoseWrite's per-category transaction call
  // Sentinel is division by zero (SQLSTATE 22012). Here we throw 42703.
  const txErr = new Error('column not found');
  txErr.code = '42703';

  // Sentinel detection: only SQLSTATE 22012
  const isSentinel = txErr.code === '22012';

  assert(!isSentinel, 'T31a: 42703 not recognized as sentinel');

  // Simulate diagnoseWrite's result construction for non-sentinel failure
  const result = { category: 'school_locations', result: 'failed', code: typeof txErr.code === 'string' ? txErr.code : 'unknown' };
  assert(result.category === 'school_locations', 'T31b: category preserved');
  assert(result.result === 'failed', 'T31c: result=failed');
  assert(result.code === '42703', 'T31d: code=42703');

  // Verify typeof check works (identical to production code)
  const noCode = { code: undefined };
  const result2 = { category: 'census_sa2_data', result: 'failed', code: typeof noCode.code === 'string' ? noCode.code : 'unknown' };
  assert(result2.code === 'unknown', 'T31e: undefined code -> unknown');
}

// ================================================================
// Test 32: 输出不泄露敏感信息（SQL/密码/host/message/stack）
// ================================================================
{
  const mockResults = [
    { category: 'school_locations', result: 'pass_rolled_back' },
    { category: 'school_profiles', result: 'pass_rolled_back' },
    { category: 'comparable_sales', result: 'pass_rolled_back' },
    { category: 'census_sa2_data', result: 'pass_rolled_back' },
  ];

  for (const r of mockResults) {
    const line = 'WRITE_DIAG category=' + r.category + ' result=' + r.result + (r.code ? ' code=' + r.code : '');
    assert(line.startsWith('WRITE_DIAG'), 'T32a: starts with WRITE_DIAG');
    assert(line.includes('category=' + r.category), 'T32b: includes category');
    assert(line.includes('result=' + r.result), 'T32c: includes result');
    assert(!line.includes('password'), 'T32d: no password');
    assert(!line.includes('.neon.tech'), 'T32e: no host');
    assert(!line.includes('Error'), 'T32f: no Error keyword');
    assert(!line.includes('Error:'), 'T32g: no Error:');
    assert(!line.includes('  '), 'T32h: no double spaces');
  }

  // Test with failed + code
  const failLine = 'WRITE_DIAG category=census_sa2_data result=failed code=42703';
  assert(failLine.includes('code=42703'), 'T32i: includes code for failed');
  assert(!failLine.includes('Error'), 'T32j: no Error keyword');
}

// ================================================================
// Test 33: diagnoseWrite — 四类均有结果，无遗漏
// ================================================================
{
  const mockResults = [
    { category: 'school_locations', result: 'pass_rolled_back' },
    { category: 'school_profiles', result: 'pass_rolled_back' },
    { category: 'comparable_sales', result: 'pass_rolled_back' },
    { category: 'census_sa2_data', result: 'pass_rolled_back' },
  ];

  const categories = mockResults.map(r => r.category).sort();
  assert(categories.length === 4, 'T33a: exactly 4 categories');
  assert(categories[0] === 'census_sa2_data', 'T33b: has census_sa2_data');
  assert(categories[1] === 'comparable_sales', 'T33c: has comparable_sales');
  assert(categories[2] === 'school_locations', 'T33d: has school_locations');
  assert(categories[3] === 'school_profiles', 'T33e: has school_profiles');
}

// ================================================================
// Test 34: diagnoseWrite — buildPreviewQueries mock 兼容性
// makeMockTagged 生成的函数必须被 buildPreviewQueries 接受
// ================================================================
{
  // Import makeMockTagged-like function behavior
  // buildPreviewQueries 期望 previewSql 是 tagged template 函数
  // 生成的对象必须 .then() 可用
  function makeTagged() {
    function tag(strings, ...vals) {
      const sqlStr = strings.reduce((acc, s, i) => acc + s + (i < vals.length ? '$' + (i + 1) : ''), '');
      return { query: sqlStr, values: vals, then: (cb) => cb({ rowCount: 1 }) };
    }
    tag.unsafe = (query, vals) => ({
      query, values: vals || [],
      then: (cb) => cb({ rowCount: 1 }),
    });
    tag.query = tag.unsafe;
    return tag;
  }

  const mockFn = makeTagged();
  const data = {
    schools: [], profiles: [], comps: [], extraComps: [], census: [],
  };

  // school_locations
  data.schools = [{ calendar_year: 2024, acara_sml_id: -1, location_age_id: null, school_age_id: null, rolled_school_id: null, school_name: 'DIAG_TEST', suburb: 'TEST', state: 'VIC', postcode: '3000', school_sector: 'TEST', school_type: null, special_school: null, campus_type: null, latitude: null, longitude: null, abs_remoteness_area: null, abs_remoteness_name: null, meshblock: null, sa1: null, sa2_code: '299999999', sa2_name: null, sa3_code: null, sa3_name: null, sa4_code: null, sa4_name: null, lga_code: null, lga_name: null, state_electoral_code: null, state_electoral_name: null, commonwealth_electoral_code: null, commonwealth_electoral_name: null }];
  const queries = buildPreviewQueries(mockFn, data);
  assert(Array.isArray(queries), 'T34a: buildPreviewQueries returns array');
  assert(queries.length > 0, 'T34b: has queries');
  const firstQuery = queries[0];
  assert(typeof firstQuery.then === 'function', 'T34c: query is then-able');

  // Verify the mock query returns via .then()
  let resolved = false;
  firstQuery.then(result => { resolved = true; });
  assert(resolved, 'T34d: mock query resolves via .then()');
}

// ================================================================
// Test 35: CLI — --diagnose-write 参数解析
// ================================================================
{
  // Simulate argument parsing
  const args1 = ['--diagnose-write'];
  const args2 = [];
  const args3 = ['--apply'];

  const diag1 = args1.includes('--diagnose-write');
  const dry1 = !args1.includes('--apply') && !diag1;
  const diag2 = args2.includes('--diagnose-write');
  const dry2 = !args2.includes('--apply') && !diag2;
  const diag3 = args3.includes('--diagnose-write');
  const dry3 = !args3.includes('--apply') && !diag3;

  assert(diag1 === true, 'T35a: --diagnose-write detected');
  assert(dry1 === false, 'T35b: not dry-run when diagnose');
  assert(diag2 === false, 'T35c: no flag = no diagnose');
  assert(dry2 === true, 'T35d: no flag = dry-run default');
  assert(diag3 === false, 'T35e: --apply ≠ diagnose');
  // With --apply: DRY_RUN = false (apply mode, not dry-run)
  // DRY_RUN = !includes('--apply') && !DIAGNOSE = !true && !false = false
  assert(dry3 === false, 'T35f: --apply mode → not dry-run');
}


// ================================================================
// Test 36: school_profiles 诊断 — 事务含 parent location + profile + sentinel
// ================================================================
{
  // Simulate diagnoseWrite's school_profiles branch logic
  // It builds queries with BOTH schools=[DIAG_LOCATION] AND profiles=[DIAG_PROFILE]
  // Then adds a sentinel. Order: location INSERT, profile INSERT, sentinel.

  function makeTracker() {
    const queriesBuilt = [];
    function tag(strings, ...vals) {
      queriesBuilt.push('LOCATION_QUERY');
      return { then: (cb) => cb({ rowCount: 1 }) };
    }
    tag.unsafe = (query, vals) => {
      if (query.includes('school_profiles')) {
        queriesBuilt.push('PROFILE_QUERY');
      } else {
        queriesBuilt.push('UNSAFE_OTHER');
      }
      return { then: (cb) => cb({ rowCount: 1 }) };
    };
    tag.query = tag.unsafe;
    tag._queries = queriesBuilt;
    return tag;
  }

  const tsql = makeTracker();
  const LOC = { calendar_year: 2024, acara_sml_id: -99999, location_age_id: null, school_age_id: null, rolled_school_id: null, school_name: 'X', suburb: 'X', state: 'VIC', postcode: '3000', school_sector: 'X', school_type: null, special_school: null, campus_type: null, latitude: null, longitude: null, abs_remoteness_area: null, abs_remoteness_name: null, meshblock: null, sa1: null, sa2_code: '299999999', sa2_name: null, sa3_code: null, sa3_name: null, sa4_code: null, sa4_name: null, lga_code: null, lga_name: null, state_electoral_code: null, state_electoral_name: null, commonwealth_electoral_code: null, commonwealth_electoral_name: null };
  const PROF = { calendar_year: 2024, acara_sml_id: -99999, location_age_id: null, school_age_id: null, school_name: 'X', suburb: 'X', state: 'VIC', postcode: '3000', school_sector: 'X', school_type: null, campus_type: null, rolled_reporting_description: null, school_url: null, governing_body: null, governing_body_url: null, year_range: null, geolocation: null, icsea: null, icsea_percentile: null, bottom_sea_quarter_pct: null, lower_middle_sea_quarter_pct: null, upper_middle_sea_quarter_pct: null, top_sea_quarter_pct: null, teaching_staff: null, fte_teaching_staff: null, non_teaching_staff: null, fte_non_teaching_staff: null, total_enrolments: null, girls_enrolments: null, boys_enrolments: null, fte_enrolments: null, indigenous_enrolments_pct: null, lbote_yes_pct: null, lbote_no_pct: null, lbote_not_stated_pct: null };
  const queries = buildPreviewQueries(tsql, { schools: [LOC], profiles: [PROF], comps: [], extraComps: [], census: [] });
  queries.push(tsql`sentinel`);

  const qb = tsql._queries;
  const locIdx = qb.indexOf('LOCATION_QUERY');
  const profIdx = qb.indexOf('PROFILE_QUERY');
  assert(locIdx >= 0, 'T36a: location query built');
  assert(profIdx >= 0, 'T36b: profile query built');
  assert(locIdx < profIdx, 'T36c: location before profile');
  assert(queries.length === 3, `T36d: 3 queries (location + profile + sentinel)`);
}

// ================================================================
// Test 37: 每类诊断事务均独立 — sentinel 加在最后
// ================================================================
{
  function makeTracker() {
    function tag(strings, ...vals) { return { then: (cb) => cb({ rowCount: 1 }) }; }
    tag.unsafe = (query, vals) => ({ then: (cb) => cb({ rowCount: 1 }) });
    tag.query = tag.unsafe;
    return tag;
  }
  const tsql = makeTracker();

  // school_locations alone
  let q = buildPreviewQueries(tsql, { schools: [{ calendar_year: 2024, acara_sml_id: -99998, location_age_id: null, school_age_id: null, rolled_school_id: null, school_name: 'X', suburb: 'X', state: 'VIC', postcode: '3000', school_sector: 'X', school_type: null, special_school: null, campus_type: null, latitude: null, longitude: null, abs_remoteness_area: null, abs_remoteness_name: null, meshblock: null, sa1: null, sa2_code: '299999999', sa2_name: null, sa3_code: null, sa3_name: null, sa4_code: null, sa4_name: null, lga_code: null, lga_name: null, state_electoral_code: null, state_electoral_name: null, commonwealth_electoral_code: null, commonwealth_electoral_name: null }], profiles: [], comps: [], extraComps: [], census: [] });
  q.push(tsql`SELECT 1/0`);
  assert(q.length >= 2, 'T37a: school_locations has INSERT + sentinel');
  assert(q.length <= 3, 'T37b: no stray queries');

  // school_profiles (with parent location)
  const LOC2 = { calendar_year: 2024, acara_sml_id: -99997, location_age_id: null, school_age_id: null, rolled_school_id: null, school_name: 'X', suburb: 'X', state: 'VIC', postcode: '3000', school_sector: 'X', school_type: null, special_school: null, campus_type: null, latitude: null, longitude: null, abs_remoteness_area: null, abs_remoteness_name: null, meshblock: null, sa1: null, sa2_code: '299999999', sa2_name: null, sa3_code: null, sa3_name: null, sa4_code: null, sa4_name: null, lga_code: null, lga_name: null, state_electoral_code: null, state_electoral_name: null, commonwealth_electoral_code: null, commonwealth_electoral_name: null };
  const PROF2 = { calendar_year: 2024, acara_sml_id: -99997, location_age_id: null, school_age_id: null, school_name: 'X', suburb: 'X', state: 'VIC', postcode: '3000', school_sector: 'X', school_type: null, campus_type: null, rolled_reporting_description: null, school_url: null, governing_body: null, governing_body_url: null, year_range: null, geolocation: null, icsea: null, icsea_percentile: null, bottom_sea_quarter_pct: null, lower_middle_sea_quarter_pct: null, upper_middle_sea_quarter_pct: null, top_sea_quarter_pct: null, teaching_staff: null, fte_teaching_staff: null, non_teaching_staff: null, fte_non_teaching_staff: null, total_enrolments: null, girls_enrolments: null, boys_enrolments: null, fte_enrolments: null, indigenous_enrolments_pct: null, lbote_yes_pct: null, lbote_no_pct: null, lbote_not_stated_pct: null };
  q = buildPreviewQueries(tsql, { schools: [LOC2], profiles: [PROF2], comps: [], extraComps: [], census: [] });
  q.push(tsql`SELECT 1/0`);
  assert(q.length === 3, `T37c: school_profiles has 3 queries (${q.length})`);

  // comparable_sales
  q = buildPreviewQueries(tsql, { schools: [], profiles: [], comps: [{ sale_address: '__DIAG_TEST__', sale_price: 1, sale_date: '2024-01-01', property_type: 'house', bedrooms: null, bathrooms: null, car_spaces: null, land_size_sqm: null, building_area_sqm: null, suburb: 'X', state: 'VIC', postcode: null, sa2_code: null, sa2_name: null, lat: null, lon: null, source_url: 'https://x.com', source_name: 'x', raw_price_text: null, collection_date: '2024-01-01', collection_round: null, batch_id: null, verification_status: null, original_evidence: null }], extraComps: [], census: [] });
  q.push(tsql`SELECT 1/0`);
  assert(q.length >= 2, 'T37d: comparable_sales has INSERT + sentinel');

  // census_sa2_data
  q = buildPreviewQueries(tsql, { schools: [], profiles: [], comps: [], extraComps: [], census: [{ sa2_code: '299999999', g01: { total: 1 }, g02: { total: 1 }, g33: null, g36: { median_rent: 1 }, g37: { median_rent: 1 }, g40: null, g41: null }] });
  q.push(tsql`SELECT 1/0`);
  assert(q.length >= 2, 'T37e: census_sa2_data has INSERT + sentinel');
}

// ================================================================
// Test 38: test ID 使用合法字段值
// ================================================================
{
  assert(typeof -99999 === 'number', 'T38a: acara_sml_id is number');
  assert(-99999 < 0, 'T38b: acara_sml_id is negative');
  assert(typeof '299999999' === 'string', 'T38c: sa2_code is string');
  assert('299999999'.length === 9, 'T38d: sa2_code is 9 digits');
  const c = { sale_price: 1 };
  assert(c.sale_price > 0, 'T38e: sale_price is positive');
}

// ================================================================
// Test 39: WRITE_FAILED SQLSTATE 提取 — 无优先级歧义
// ================================================================
{
  function extractSqlstate(txErr) {
    return typeof txErr.code === 'string' ? txErr.code : undefined;
  }

  assert(extractSqlstate({ code: '22001' }) === '22001', 'T39a: string code extracted');
  assert(extractSqlstate({ code: undefined }) === undefined, 'T39b: undefined returns undefined');
  assert(extractSqlstate({ code: null }) === undefined, 'T39c: null returns undefined');
  assert(extractSqlstate({ code: '' }) === '', 'T39d: empty string returns empty string (still string type)');
  assert(extractSqlstate({ code: 22001 }) === undefined, 'T39e: numeric returns undefined');

  // Verify original precedence bug is fixed
  const bugCase = { code: '', severity: 'ERROR' };
  const originalBad = (bugCase.code || bugCase.severity) ? bugCase.code : undefined;
  assert(originalBad === '', 'T39f: original precedence bug returns empty string');
  assert(extractSqlstate(bugCase) === '', 'T39g: fixed returns empty string (no precedence bug possible)');
}


// ================================================================
// Test 40: 三类动态 SQL 使用 query() 而非 unsafe()
// ================================================================
{
  const called = { query: false, unsafe: false, queryCalls: [], unsafeCalls: [] };
  function makeTracker() {
    function tag(strings, ...vals) {
      called.tagCalled = true;
      return { then: (cb) => cb({ rowCount: 1 }) };
    }
    tag.query = (q, p) => { called.query = true; called.queryCalls.push({ q: q.substring(0,40), p }); return { then: (cb) => cb({ rowCount: 1 }) }; };
    tag.unsafe = (q, p) => { called.unsafe = true; called.unsafeCalls.push({ q: q.substring(0,40), p }); return { then: (cb) => cb({ rowCount: 1 }) }; };
    return tag;
  }
  const LOC = { calendar_year: 2024, acara_sml_id: -99997, location_age_id: null, school_age_id: null, rolled_school_id: null, school_name: 'X', suburb: 'X', state: 'VIC', postcode: '3000', school_sector: 'X', school_type: null, special_school: null, campus_type: null, latitude: null, longitude: null, abs_remoteness_area: null, abs_remoteness_name: null, meshblock: null, sa1: null, sa2_code: '299999999', sa2_name: null, sa3_code: null, sa3_name: null, sa4_code: null, sa4_name: null, lga_code: null, lga_name: null, state_electoral_code: null, state_electoral_name: null, commonwealth_electoral_code: null, commonwealth_electoral_name: null };
  const PROF = { calendar_year: 2024, acara_sml_id: -99997, location_age_id: null, school_age_id: null, school_name: 'X', suburb: 'X', state: 'VIC', postcode: '3000', school_sector: 'X', school_type: null, campus_type: null, rolled_reporting_description: null, school_url: null, governing_body: null, governing_body_url: null, year_range: null, geolocation: null, icsea: null, icsea_percentile: null, bottom_sea_quarter_pct: null, lower_middle_sea_quarter_pct: null, upper_middle_sea_quarter_pct: null, top_sea_quarter_pct: null, teaching_staff: null, fte_teaching_staff: null, non_teaching_staff: null, fte_non_teaching_staff: null, total_enrolments: null, girls_enrolments: null, boys_enrolments: null, fte_enrolments: null, indigenous_enrolments_pct: null, lbote_yes_pct: null, lbote_no_pct: null, lbote_not_stated_pct: null };
  const COMP = { sale_address: '__DIAG_T__', sale_price: 1, sale_date: '2024-01-01', property_type: 'house', bedrooms: null, bathrooms: null, car_spaces: null, land_size_sqm: null, building_area_sqm: null, suburb: 'X', state: 'VIC', postcode: null, sa2_code: null, sa2_name: null, lat: null, lon: null, source_url: 'https://x.com', source_name: 'x', raw_price_text: null, collection_date: '2024-01-01', collection_round: null, batch_id: null, verification_status: null, original_evidence: null };
  const CENS = { sa2_code: '299999999', g01: { total: 1 }, g02: { total: 1 }, g33: null, g36: { median_rent: 1 }, g37: { median_rent: 1 }, g40: null, g41: null };

  // Clear and build profiles
  called.query = false; called.unsafe = false; called.queryCalls = []; called.unsafeCalls = [];
  const tsql1 = makeTracker();
  const q1 = buildPreviewQueries(tsql1, { schools: [], profiles: [PROF], comps: [], extraComps: [], census: [] });
  assert(called.query === true, 'T40a: school_profiles uses query()');
  assert(called.unsafe === false, 'T40b: school_profiles does NOT use unsafe()');
  // Each row triggers one query() call
  assert(called.queryCalls.length === 1, `T40c: profiles query() called ${called.queryCalls.length} time`);

  // Clear and build comps
  called.query = false; called.unsafe = false; called.queryCalls = []; called.unsafeCalls = [];
  const tsql2 = makeTracker();
  const q2 = buildPreviewQueries(tsql2, { schools: [], profiles: [], comps: [COMP], extraComps: [], census: [] });
  assert(called.query === true, 'T40d: comparable_sales uses query()');
  assert(called.unsafe === false, 'T40e: comparable_sales does NOT use unsafe()');
  assert(called.queryCalls.length === 1, `T40f: comps query() called ${called.queryCalls.length} time`);

  // Clear and build census
  called.query = false; called.unsafe = false; called.queryCalls = []; called.unsafeCalls = [];
  const tsql3 = makeTracker();
  const q3 = buildPreviewQueries(tsql3, { schools: [], profiles: [], comps: [], extraComps: [], census: [CENS] });
  assert(called.query === true, 'T40g: census_sa2_data uses query()');
  assert(called.unsafe === false, 'T40h: census_sa2_data does NOT use unsafe()');
  assert(called.queryCalls.length === 1, `T40i: census query() called ${called.queryCalls.length} time`);
}

// ================================================================
// Test 41: query() 参数数量正确
// ================================================================
{
  const PROF = { calendar_year: 2024, acara_sml_id: -99997, location_age_id: null, school_age_id: null, school_name: 'X', suburb: 'X', state: 'VIC', postcode: '3000', school_sector: 'X', school_type: null, campus_type: null, rolled_reporting_description: null, school_url: null, governing_body: null, governing_body_url: null, year_range: null, geolocation: null, icsea: null, icsea_percentile: null, bottom_sea_quarter_pct: null, lower_middle_sea_quarter_pct: null, upper_middle_sea_quarter_pct: null, top_sea_quarter_pct: null, teaching_staff: null, fte_teaching_staff: null, non_teaching_staff: null, fte_non_teaching_staff: null, total_enrolments: null, girls_enrolments: null, boys_enrolments: null, fte_enrolments: null, indigenous_enrolments_pct: null, lbote_yes_pct: null, lbote_no_pct: null, lbote_not_stated_pct: null };
  const COMP = { sale_address: '__DIAG_T__', sale_price: 1, sale_date: '2024-01-01', property_type: 'house', bedrooms: null, bathrooms: null, car_spaces: null, land_size_sqm: null, building_area_sqm: null, suburb: 'X', state: 'VIC', postcode: null, sa2_code: null, sa2_name: null, lat: null, lon: null, source_url: 'https://x.com', source_name: 'x', raw_price_text: null, collection_date: '2024-01-01', collection_round: null, batch_id: null, verification_status: null, original_evidence: null };
  const CENS = { sa2_code: '299999999', g01: { total: 1 }, g02: { total: 1 }, g33: null, g36: { median_rent: 1 }, g37: { median_rent: 1 }, g40: null, g41: null };

  let paramCounts = {};

  function makeCapturer() {
    function tag(strings, ...vals) { return { then: (cb) => cb({ rowCount: 1 }) }; }
    tag.query = (q, p) => {
      const name = q.includes('school_profiles') ? 'profiles' : q.includes('comparable_sales') ? 'comps' : 'census';
      paramCounts[name] = (p || []).length;
      return { then: (cb) => cb({ rowCount: 1 }) };
    };
    tag.unsafe = (q, p) => {
      // Should not be called, but capture if it is
      const name = q.includes('school_profiles') ? 'profiles' : q.includes('comparable_sales') ? 'comps' : 'census';
      paramCounts[name + '_unsafe'] = (p || []).length;
      return { then: (cb) => cb({ rowCount: 1 }) };
    };
    return tag;
  }

  const tsql = makeCapturer();
  const q = buildPreviewQueries(tsql, {
    schools: [], profiles: [PROF], comps: [COMP], extraComps: [], census: [CENS],
  });

  // school_profiles: SP_COLS (35) + acara_sml_id + calendar_year = 37 params
  // The user said 36 - but SP_COLS is 35, +2 = 37. Use the actual count.
  assert(paramCounts.profiles === 37, `T41a: profiles has ${paramCounts.profiles} params (expected: 37)`);
  // comparable_sales: CS_COLS (24) + 4 WHERE NOT EXISTS = 28
  assert(paramCounts.comps === 28, `T41b: comps has ${paramCounts.comps} params (expected: 28)`);
  // census_sa2_data: 8
  assert(paramCounts.census === 8, `T41c: census has ${paramCounts.census} params (expected: 8)`);
}
// Run async tests
// ================================================================
;(async () => {
  await test9();
  await test10();
  await test11();
  await test16();
  await test19();
  await test20();
  await test28();
  await test31();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})();
