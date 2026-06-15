// ── Payment Gate — Environment Matrix Test ──
// Phase 2A: Tests every environment variable combination against the
// shared lib/payment-gate.js module.
//
// Usage:  node tests/test-payment-gate.mjs

import { isPaymentsEnabled } from "../lib/payment-gate.js";

// ── Helpers ─────────────────────────────────────────────────────────

function setEnv(overrides) {
  // Merge overrides onto a clean base (all falsy/undefined)
  const base = {
    VERCEL_ENV: undefined,
    STRIPE_MODE: undefined,
    PAYMENTS_ENABLED: undefined,
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = String(v);
    }
  }
}

const PASS = "✅ PASS";
const FAIL = "❌ FAIL";

function assert(label, expected) {
  const actual = isPaymentsEnabled();
  const pass = actual === expected;
  console.log(`  ${pass ? PASS : FAIL} ${label} → ${actual} ${pass ? "" : `(expected ${expected})"`}`);
  if (!pass) {
    const env = {};
    for (const k of ["VERCEL_ENV", "STRIPE_MODE", "PAYMENTS_ENABLED"]) {
      env[k] = process.env[k];
    }
    console.log(`    env: ${JSON.stringify(env)}`);
  }
}

// ── Tests ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label, overrides, expected) {
  setEnv(overrides);
  const actual = isPaymentsEnabled();
  const pass = actual === expected;
  if (pass) passed++; else failed++;
  console.log(`  ${pass ? PASS : FAIL} ${label} → ${actual}`);
  if (!pass) {
    console.log(`    env: VERCEL_ENV=${process.env.VERCEL_ENV} STRIPE_MODE=${process.env.STRIPE_MODE} PAYMENTS_ENABLED=${process.env.PAYMENTS_ENABLED}`);
  }
}

console.log("━━━ Payment Gate — Environment Matrix ━━━\n");

// ─── Preview ────────────────────────────────────────────────────

console.log("◆ Preview environment:");

test("preview + test mode",    { VERCEL_ENV: "preview", STRIPE_MODE: "test" }, true);

test("preview + test + PAYMENTS_ENABLED=true",  { VERCEL_ENV: "preview", STRIPE_MODE: "test", PAYMENTS_ENABLED: "true" }, true);
test("preview + test + PAYMENTS_ENABLED=false", { VERCEL_ENV: "preview", STRIPE_MODE: "test", PAYMENTS_ENABLED: "false" }, true);

test("preview + live (blocked)", { VERCEL_ENV: "preview", STRIPE_MODE: "live" }, false);
test("preview + live + true",    { VERCEL_ENV: "preview", STRIPE_MODE: "live", PAYMENTS_ENABLED: "true" }, false);
test("preview + no STRIPE_MODE", { VERCEL_ENV: "preview" }, false);
test("preview + empty STRIPE_MODE", { VERCEL_ENV: "preview", STRIPE_MODE: "" }, false);

// ─── Production ─────────────────────────────────────────────────

console.log("\n◆ Production environment:");

test("prod + live + PAYMENTS_ENABLED=true",  { VERCEL_ENV: "production", STRIPE_MODE: "live", PAYMENTS_ENABLED: "true" }, true);

test("prod + live (no flag)",                { VERCEL_ENV: "production", STRIPE_MODE: "live" }, false);
test("prod + live + false",                  { VERCEL_ENV: "production", STRIPE_MODE: "live", PAYMENTS_ENABLED: "false" }, false);
test("prod + test + true",                   { VERCEL_ENV: "production", STRIPE_MODE: "test", PAYMENTS_ENABLED: "true" }, false);
test("prod + test (no flag)",                { VERCEL_ENV: "production", STRIPE_MODE: "test" }, false);
test("prod + no STRIPE_MODE",                { VERCEL_ENV: "production", PAYMENTS_ENABLED: "true" }, false);
test("prod + no flag + no mode",             { VERCEL_ENV: "production" }, false);
test("prod + live + PAYMENTS_ENABLED=TRUE (uppercase)",  { VERCEL_ENV: "production", STRIPE_MODE: "live", PAYMENTS_ENABLED: "TRUE" }, false);
test("prod + live + PAYMENTS_ENABLED=1 (numeric)",       { VERCEL_ENV: "production", STRIPE_MODE: "live", PAYMENTS_ENABLED: "1" }, false);
test("prod + live + PAYMENTS_ENABLED=yes",               { VERCEL_ENV: "production", STRIPE_MODE: "live", PAYMENTS_ENABLED: "yes" }, false);

// ─── Development ────────────────────────────────────────────────

console.log("\n◆ Development / Other:");

test("dev + test + true",      { VERCEL_ENV: "development", STRIPE_MODE: "test", PAYMENTS_ENABLED: "true" }, false);
test("dev + live + true",      { VERCEL_ENV: "development", STRIPE_MODE: "live", PAYMENTS_ENABLED: "true" }, false);
test("dev + no mode",          { VERCEL_ENV: "development" }, false);
test("no VERCEL_ENV",          { STRIPE_MODE: "test", PAYMENTS_ENABLED: "true" }, false);
test("empty string env",       { VERCEL_ENV: "", STRIPE_MODE: "test", PAYMENTS_ENABLED: "true" }, false);

// ─── Summary ────────────────────────────────────────────────────

console.log(`\n━━━ Summary: ${passed + failed} tests, ${passed} passed, ${failed} failed ━━━`);
process.exit(failed > 0 ? 1 : 0);
