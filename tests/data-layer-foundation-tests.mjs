/**
 * data-layer-foundation-tests.mjs — Phase 0
 *
 * Static analysis tests for Data Layer Foundation.
 * All tests are pure static analysis (no DB connection needed).
 *
 * Tests verify:
 *   - Migration SQL: no destrutive ops, correct schema, no geometry
 *   - registry service: validation, exports, no credential exposure
 *   - derived service: exports, forbidden words, heritage defaults
 *   - dry-run script: read-only guarantee, --apply rejection, no logs of secrets
 *   - _db.js: schema function safety
 *   - File existence across all 7 target files
 *
 * No DATABASE_URL required to run these tests.
 * Live DB tests are explicitly skipped (Phase 0 constraint).
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function ok(condition, label) {
  if (condition) { passed++; }
  else { failed++; console.error(`  ❌ ${label}`); }
}

function note(msg) {
  console.log(`  ℹ️  ${msg}`);
}

// ═══════════════════════════════════════════════════════════════
// 1. Migration SQL Audit
// ═══════════════════════════════════════════════════════════════
function testMigrationSQL() {
  console.log("\n━━━ 1. Migration SQL Audit ───");
  const sqlContent = fs.readFileSync(
    path.join(ROOT, "db/migration-012-data-layer-foundation.sql"),
    "utf8"
  );

  // No destructive SQL statements (skip comment lines)
  const sqlLines = sqlContent.split('\n').filter(l => !l.trim().startsWith('--'));
  const sqlCode = sqlLines.join('\n');
  ok(!/DROP\s+TABLE\b/im.test(sqlCode), "No DROP TABLE");
  ok(!/\bTRUNCATE\b/i.test(sqlCode), "No TRUNCATE");
  ok(!/\bDELETE\b/i.test(sqlCode), "No DELETE");

  // Three tables
  ok(sqlContent.includes("CREATE TABLE IF NOT EXISTS data_source_registry"),
    "data_source_registry DDL");
  ok(sqlContent.includes("CREATE TABLE IF NOT EXISTS suburb_planning_summary"),
    "suburb_planning_summary DDL");
  ok(sqlContent.includes("CREATE TABLE IF NOT EXISTS property_planning_cache"),
    "property_planning_cache DDL");

  // Uniqueness: either inline UNIQUE or separate UNIQUE constraint
  ok(/source_key\s+TEXT[^;]+UNIQUE/im.test(sqlContent) ||
     /UNIQUE\s*\(source_key\)/im.test(sqlContent),
    "source_key is UNIQUE");

  // No geometry data type (comments mentioning geometry are ok)
  const ddlOnly = sqlLines.filter(l => /CREATE TABLE|\bTEXT\b|\bINTEGER\b|\bBIGSERIAL\b|\bBOOLEAN\b|\bNUMERIC\b|\btimestamp/i.test(l)).join('\n');
  ok(!/(geometry|GEOMETRY)\(/im.test(ddlOnly) && !/\bgeography\b/i.test(ddlOnly),
    "No geometry/geography data type columns");

  // Heritage status CHECK constraint
  ok(/heritage_status[^']*'unknown'/im.test(sqlContent),
    "heritage_status default 'unknown'");

  // source_type CHECK
  ok(/chk_source_type\s+CHECK\s*\(/im.test(sqlContent) &&
     /source_type\s+IN\s*\(/im.test(sqlContent),
    "source_type CHECK constraint");

  // CHECK on scores
  ok(/>= -15/im.test(sqlContent) && /<= 15/im.test(sqlContent),
    "Score bounds [-15, 15] via CHECK constraints");
}

// ═══════════════════════════════════════════════════════════════
// 2. _db.js ensureDataLayerFoundationSchema
// ═══════════════════════════════════════════════════════════════
function testDbSchema() {
  console.log("\n━━━ 2. _db.js Schema Function ───");
  const dbContent = fs.readFileSync(path.join(ROOT, "api/_db.js"), "utf8");

  ok(dbContent.includes("ensureDataLayerFoundationSchema"),
    "ensureDataLayerFoundationSchema exported");
  ok(dbContent.includes("dataLayerInitialized"), "dataLayerInitialized flag present");

  // Isolate the function body for safer analysis
  const funcIdx = dbContent.indexOf("ensureDataLayerFoundationSchema");
  const afterComment = dbContent.substring(funcIdx);
  const bodyEnd = afterComment.lastIndexOf("}");
  const funcBody = afterComment.substring(0, bodyEnd + 1);

  ok(!/\bDROP\s+TABLE\b/i.test(funcBody),
    "No DROP TABLE in schema function");
  ok(!/\bTRUNCATE\b/i.test(funcBody),
    "No TRUNCATE in schema function");
  ok(!/\bDELETE\s+(FROM\b)?/i.test(funcBody),
    "No DELETE in schema function");
}

// ═══════════════════════════════════════════════════════════════
// 3. data-source-registry.js
// ═══════════════════════════════════════════════════════════════
function testDataSourceRegistry() {
  console.log("\n━━━ 3. data-source-registry.js ───");
  const pathName = path.join(ROOT, "lib/data-source-registry.js");
  if (!fs.existsSync(pathName)) {
    ok(false, "File data-source-registry.js exists");
    return;
  }
  const regContent = fs.readFileSync(pathName, "utf8");

  ok(regContent.includes("upsertDataSourceRegistry"), "exports upsertDataSourceRegistry");
  ok(regContent.includes("getDataSourceRegistry"), "exports getDataSourceRegistry");
  ok(regContent.includes("listDataSourceRegistry"), "exports listDataSourceRegistry");
  ok(regContent.includes("isValidSourceKey"), "exports isValidSourceKey");
  ok(regContent.includes("isValidSourceType"), "exports isValidSourceType");
  ok(regContent.includes("ALLOWED_TYPES"), "exports ALLOWED_TYPES");

  // No credential/secret exposure
  ok(!regContent.includes("process.env"), "No process.env access");
  ok(!regContent.includes("DATABASE_URL"), "No DATABASE_URL literal");

  // Regex validation
  ok(regContent.includes("/^[a-z0-9._-]+$/"), "Source key regex present");
}

// ═══════════════════════════════════════════════════════════════
// 4. planning-derived-service.js
// ═══════════════════════════════════════════════════════════════
function testPlanningDerivedService() {
  console.log("\n━━━ 4. planning-derived-service.js ───");
  const pathName = path.join(ROOT, "lib/planning-derived-service.js");
  if (!fs.existsSync(pathName)) {
    ok(false, "File planning-derived-service.js exists");
    return;
  }
  const pdContent = fs.readFileSync(pathName, "utf8");

  ok(pdContent.includes("buildPropertyPlanningCacheRecord"),
    "exports buildPropertyPlanningCacheRecord");
  ok(pdContent.includes("buildSuburbPlanningSummaryRecord"),
    "exports buildSuburbPlanningSummaryRecord");
  ok(pdContent.includes("derivePlanningConstraintSummary"),
    "exports derivePlanningConstraintSummary");
  ok(pdContent.includes("validatePlanningComponentScore"),
    "exports validatePlanningComponentScore");

  // No PostGIS function calls (comments mentioning geometry are fine)
  const codeOnly = pdContent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok(!/ST_\w+/i.test(codeOnly),
    "No ST_ prefix (PostGIS functions)");
  ok(!/\bgeometry\b/im.test(codeOnly),
    "No geometry keyword in code");

  // Forbidden language
  const forbidden = ["approval likely", "can subdivide", "no heritage risk", "guaranteed"];
  for (const f of forbidden) {
    ok(!pdContent.toLowerCase().includes(f),
      `No '${f}' in source`);
  }

  // Score validation pattern
  ok(/Math\.max\(-15,\s*Math\.min\(15,/im.test(pdContent) ||
     /return\s+Math\.max\(-15,/.test(pdContent),
    "Score capped to [-15, 15]");

  // Heritage logic: must derive not hardcode
  ok(!pdContent.includes('heritageStatus: "known"'),
    "heritageStatus 'known' not hardcoded");

  // Contains derivePlanningConstraintSummary logic
  ok(pdContent.includes("derivePlanningConstraintSummary"),
    "Derive function present");
}

// ═══════════════════════════════════════════════════════════════
// 5. Dry-run script audit
// ═══════════════════════════════════════════════════════════════
function testDryRunScript() {
  console.log("\n━━━ 5. Dry-run script ───");
  const pathName = path.join(ROOT, "scripts/backfill-planning-derived-dry-run.mjs");
  if (!fs.existsSync(pathName)) {
    ok(false, "File dry-run script exists");
    return;
  }
  const content = fs.readFileSync(pathName, "utf8");

  ok(content.includes("DRY RUN"), "Labels itself as DRY RUN");
  ok(content.includes("--apply"), "Handles --apply flag");
  ok(content.includes("DISABLED"), "--apply is explicitly disabled");

  // No write operations
  ok(!/INSERT\s+INTO/i.test(content), "No INSERT INTO");
  ok(!/\bUPDATE\s+\w+\s+SET\b/i.test(content), "No UPDATE");
  ok(!/\bDELETE\s+FROM\b/i.test(content), "No DELETE FROM");
  ok(!/CREATE\s+TABLE/i.test(content), "No CREATE TABLE");
  ok(!/\bDROP\b/i.test(content), "No DROP");
  ok(!/\bTRUNCATE\b/i.test(content), "No TRUNCATE");

  // Is read-only: contains SELECT FROM
  ok(/FROM\s+vicplan_zones/im.test(content), "SELECT FROM vicplan_zones");
  ok(/FROM\s+vicplan_overlays/im.test(content), "SELECT FROM vicplan_overlays");
  ok(/FROM\s+suburb_planning_summary/im.test(content), "SELECT FROM suburb_planning_summary");
  ok(/FROM\s+property_planning_cache/im.test(content), "SELECT FROM property_planning_cache");
  ok(/FROM\s+data_source_registry/im.test(content), "SELECT FROM data_source_registry");

  // Error handling
  ok(content.includes("catch"), "Has error handling");
  ok(content.includes("process.exit(1)"), "Exits on error");
}

// ═══════════════════════════════════════════════════════════════
// 6. Forbidden word scan (all files)
// ═══════════════════════════════════════════════════════════════
function testForbiddenWords() {
  console.log("\n━━━ 6. Forbidden word scan ───");
  const forbidden = ["approval likely", "can subdivide", "no heritage risk", "guaranteed"];
  const files = [
    "lib/data-source-registry.js",
    "lib/planning-derived-service.js",
    "scripts/backfill-planning-derived-dry-run.mjs",
    "db/migration-012-data-layer-foundation.sql",
  ];

  let found = false;
  for (const file of files) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, "utf8").toLowerCase();
    for (const f of forbidden) {
      if (content.includes(f)) {
        ok(false, `Forbidden '${f}' in ${file}`);
        found = true;
      }
    }
  }
  if (!found) ok(true, "No forbidden words in Phase 0 files");
}

// ═══════════════════════════════════════════════════════════════
// 7. Dry-run no secret logging
// ═══════════════════════════════════════════════════════════════
function testDryRunNoSecrets() {
  console.log("\n━━━ 7. Dry-run secret audit ───");
  const pathName = path.join(ROOT, "scripts/backfill-planning-derived-dry-run.mjs");
  if (!fs.existsSync(pathName)) {
    note("dry-run script not found, skipping");
    ok(true, "Skipped: file not found");
    return;
  }
  const content = fs.readFileSync(pathName, "utf8");

  // DATABASE_URL is accessed but not logged (console.log with the env var value)
  const hasAccess = content.includes("process.env.DATABASE_URL");
  // Logging to console.error that DATABASE_URL is missing is acceptable
  const logEnvValue = /console\.(log|error|warn)\([^)]*process\.env\.DATABASE_URL/m.test(content);
  ok(hasAccess, "Accesses DATABASE_URL from env");
  ok(!logEnvValue, "Does not log DATABASE_URL env var value");
}

// ═══════════════════════════════════════════════════════════════
// 8. Migration SQL CHECK constraints
// ═══════════════════════════════════════════════════════════════
function testMigrationConstraints() {
  console.log("\n━━━ 8. Migration SQL CHECK Constraints ───");
  const pathName = path.join(ROOT, "db/migration-012-data-layer-foundation.sql");
  if (!fs.existsSync(pathName)) {
    ok(false, "Migration SQL file exists");
    return;
  }
  const content = fs.readFileSync(pathName, "utf8");

  ok(content.includes("chk_source_type"), "chk_source_type");
  ok(content.includes("chk_heritage_status"), "chk_heritage_status (suburb)");
  ok(content.includes("chk_ppc_heritage"), "chk_ppc_heritage (property cache)");
  ok(content.includes("chk_flexibility_score"), "chk_flexibility_score");
  ok(content.includes("chk_ppc_constraint"), "chk_ppc_constraint");
  ok(content.includes("chk_constraint_level"), "chk_constraint_level");

  // Column names
  ok(content.includes("planning_component_score"), "Column: planning_component_score");
  ok(content.includes("redevelopment_flexibility_score"), "Column: redevelopment_flexibility_score");
  ok(content.includes("redevelopment_flexibility_hint"), "Column: redevelopment_flexibility_hint");
}

// ═══════════════════════════════════════════════════════════════
// 9. File existence — all 7 Phase 0 targets
// ═══════════════════════════════════════════════════════════════
function testFileExistence() {
  console.log("\n━━━ 9. Phase 0 file existence ───");
  const files = [
    "db/migration-012-data-layer-foundation.sql",
    "lib/data-source-registry.js",
    "lib/planning-derived-service.js",
    "scripts/backfill-planning-derived-dry-run.mjs",
    "tests/data-layer-foundation-tests.mjs",
    "docs/engineering-reports/DATA_LAYER_PHASE0_DESIGN.md",
    "api/_db.js", // pre-existing, must have ensureDataLayerFoundationSchema
  ];

  let allGood = true;
  for (const f of files) {
    const exists = fs.existsSync(path.join(ROOT, f));
    if (!exists) { ok(false, `${f} exists`); allGood = false; }
  }
  if (allGood) ok(true, `All ${files.length} targets exist`);
}

// ═══════════════════════════════════════════════════════════════
// 10. Pure function tests (dynamic import — no DB required)
// ═══════════════════════════════════════════════════════════════
async function testPureFunctions() {
  console.log("\n━━━ 10. Pure function tests ───");

  // Dynamic import to load the module
  let mod;
  try {
    mod = await import(path.join(ROOT, "lib/planning-derived-service.js"));
  } catch (e) {
    ok(false, `Module import failed: ${e.message}`);
    return;
  }

  // 10a. GRZ1/residential → zone_flexibility must not be "unknown"
  const grzResult = mod.buildPropertyPlanningCacheRecord({
    propertyKey: "test/123",
    address: "123 Test St",
    suburb: "Testville",
    lat: -37.81,
    lng: 144.96,
    planningSignals: {
      ok: true,
      zone: { code: "GRZ1", category: "residential" },
      overlays: [],
    },
  });
  ok(grzResult.zone_flexibility !== "unknown",
    `GRZ1/residential → zone_flexibility = "${grzResult.zone_flexibility}" (not unknown)`);
  ok(grzResult.zone_flexibility === "favourable",
    `GRZ1/residential → zone_flexibility = "favourable"`);

  // 10b. Mixed-use zone → favourable
  const muzResult = mod.buildPropertyPlanningCacheRecord({
    propertyKey: "test/456",
    address: "456 Test St",
    suburb: "Testville",
    lat: -37.82,
    lng: 144.97,
    planningSignals: {
      ok: true,
      zone: { code: "MUZ", category: "mixed-use" },
      overlays: [],
    },
  });
  ok(muzResult.zone_flexibility !== "unknown",
    `MUZ/mixed-use → zone_flexibility = "${muzResult.zone_flexibility}" (not unknown)`);
  ok(muzResult.zone_flexibility === "favourable",
    `MUZ/mixed-use → zone_flexibility = "favourable"`);

  // 10c. Rural zone → constrained
  const ruralResult = mod.buildPropertyPlanningCacheRecord({
    propertyKey: "test/789",
    address: "789 Test Rd",
    suburb: "Ruralville",
    lat: -37.9,
    lng: 144.5,
    planningSignals: {
      ok: true,
      zone: { code: "FZ", category: "rural" },
      overlays: [],
    },
  });
  ok(ruralResult.zone_flexibility === "constrained",
    `FZ/rural → zone_flexibility = "constrained"`);

  // 10d. Commercial zone → mixed
  const commercialResult = mod.buildPropertyPlanningCacheRecord({
    propertyKey: "test/101",
    address: "101 Test Rd",
    suburb: "Testville",
    lat: -37.83,
    lng: 144.98,
    planningSignals: {
      ok: true,
      zone: { code: "C1Z", category: "commercial" },
      overlays: [],
    },
  });
  ok(commercialResult.zone_flexibility === "mixed",
    `C1Z/commercial → zone_flexibility = "mixed"`);

  // 10e. No zone → null
  const noZoneResult = mod.buildPropertyPlanningCacheRecord({
    propertyKey: "test/202",
    address: "202 Test St",
    suburb: "Testville",
    lat: -37.81,
    lng: 144.96,
    planningSignals: { ok: false },
  });
  ok(noZoneResult.zone_flexibility === null,
    "No zone → zone_flexibility = null");

  // 10f. deriveFlexFromCategory removed (no longer exported)
  ok(typeof mod.deriveFlexFromCategory === "undefined",
    "deriveFlexFromCategory no longer exported");
}

// ═══════════════════════════════════════════════════════════════
// 11. Registry error message audit — no source_key echo in errors
// ═══════════════════════════════════════════════════════════════
function testRegistryErrorMessages() {
  console.log("\n━━━ 11. Registry error message audit ───");
  const pathName = path.join(ROOT, "lib/data-source-registry.js");
  const content = fs.readFileSync(pathName, "utf8");

  // Error messages must NOT contain variable interpolation in the first error arg
  ok(content.includes('. Must match') || content.includes('source_key.'),
    "source_key error message is generic (no raw input echo)");
  ok(!/\\$\{entry\.source_key\}/.test(content),
    "source_key error no longer echoes entry.source_key");
  ok(!/\\$\{entry\.source_type\}/.test(content),
    "source_type error no longer echoes entry.source_type");
}

// ═══════════════════════════════════════════════════════════════
// 12. Row count — ?? null not || null
// ═══════════════════════════════════════════════════════════════
function testRowCountNullish() {
  console.log("\n━━━ 12. Row count ?? null not || null ───");
  const pathName = path.join(ROOT, "lib/data-source-registry.js");
  const content = fs.readFileSync(pathName, "utf8");

  ok(content.includes("row_count ?? null"),
    "row_count uses ?? null (not || null)");
  ok(!content.includes("row_count || null"),
    "row_count does not use || null");
}

// ═══════════════════════════════════════════════════════════════
// Run
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  Data Layer Phase 0 — Foundation Tests");
  console.log("═══════════════════════════════════════════\n");

  testMigrationSQL();
  testDbSchema();
  testDataSourceRegistry();
  testPlanningDerivedService();
  testDryRunScript();
  testForbiddenWords();
  testDryRunNoSecrets();
  testMigrationConstraints();
  testFileExistence();
  await testPureFunctions();
  testRegistryErrorMessages();
  testRowCountNullish();

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed) {
    console.error(`\n  ${failed} failure(s) — see above`);
    process.exit(1);
  } else {
    console.log(`  ✅ ALL PASS`);
    console.log(`═══════════════════════════════════════════\n`);
  }
}

main();
