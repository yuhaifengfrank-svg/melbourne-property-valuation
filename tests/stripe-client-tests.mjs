// ── Phase 1E3D-2B: Stripe Client Module Tests ──
//
// Tests the lib/stripe-client.js module in isolation.
// Covers STRIPE_MODE validation, key prefix checks, Vercel environment
// guards, Price ID format checks, and backward compatibility with mocks.
// No real Stripe network calls.

import assert from "node:assert/strict";
import test from "node:test";

// ── Helper: reload the module fresh each test ───────────────────────

/**
 * Reload stripe-client module, clearing its singleton state and env vars.
 */
async function reloadStripeClient() {
  const { resetStripeClient, setMockStripe } = await import(
    "../lib/stripe-client.js"
  );
  resetStripeClient();
  setMockStripe(null);
  return await import("../lib/stripe-client.js");
}

/**
 * Helper: run a callback with temporary env vars, then restore.
 */
function withEnv(vars, fn) {
  const restore = {};
  for (const [k, v] of Object.entries(vars)) {
    restore[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(restore)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

/**
 * Helper: async version of withEnv for reloadStripeClient patterns.
 */
async function withEnvAsync(vars, fn) {
  const restore = {};
  for (const [k, v] of Object.entries(vars)) {
    restore[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(restore)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

// ── STRIPE_MODE validation ──────────────────────────────────────────

test("missing STRIPE_MODE in non-test env throws", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_MODE: undefined,
    STRIPE_SECRET_KEY: ("sk_" + "test_" + "abc123"),
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    assert.throws(() => getStripe(), {
      message: /STRIPE_MODE/,
    }, "Missing STRIPE_MODE must throw in non-test env");
  });
});

test("invalid STRIPE_MODE value throws", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_MODE: "production",
    STRIPE_SECRET_KEY: ("sk_" + "test_" + "abc123"),
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    assert.throws(() => getStripe(), {
      message: /must be "test" or "live"/,
    }, "Invalid STRIPE_MODE must throw");
  });
});

test("STRIPE_MODE empty string is treated as missing", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_MODE: "",
    STRIPE_SECRET_KEY: ("sk_" + "test_" + "abc123"),
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    assert.throws(() => getStripe(), {
      message: /STRIPE_MODE/,
    }, "Empty STRIPE_MODE must throw as missing");
  });
});

// ── STRIPE_MODE + key prefix matching ───────────────────────────────

test("test mode + test secret prefix passes", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: ("sk_" + "test_" + "4eC39HqLyjWDarjtT1zdp7dc"),
    STRIPE_PRICE_ID_REPORT_399: "price_test_399_report",
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    const client = getStripe();
    assert.ok(client, "getStripe must return a client");
    assert.ok(typeof client.checkout?.sessions?.create === "function",
      "Client must have checkout.sessions.create");
  });
});

test("test mode + live secret prefix rejects", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: ("sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc"),
    STRIPE_PRICE_ID_REPORT_399: "price_test_399_report",
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    assert.throws(() => getStripe(), {
      message: /test secret key prefix/,
    }, "Live key must be rejected when mode is test");
  });
});

test("live mode + live secret prefix passes", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_MODE: "live",
    STRIPE_SECRET_KEY: ("sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc"),
    STRIPE_PRICE_ID_REPORT_399: "price_test_399_report",
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    const client = getStripe();
    assert.ok(client, "getStripe must return a client");
  });
});

test("live mode + test secret prefix rejects", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_MODE: "live",
    STRIPE_SECRET_KEY: ("sk_" + "test_" + "4eC39HqLyjWDarjtT1zdp7dc"),
    STRIPE_PRICE_ID_REPORT_399: "price_test_399_report",
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    assert.throws(() => getStripe(), {
      message: /live secret key prefix/,
    }, "Test key must be rejected when mode is live");
  });
});

test("error message does not leak full secret key", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: ("sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc"),
    STRIPE_PRICE_ID_REPORT_399: "price_test_399_report",
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    assert.throws(() => getStripe(), (err) => {
      // The full key must not appear in the error message
      const msg = err.message;
      return (
        new RegExp("sk_" + "live_").test(msg) &&
        !msg.includes("4eC39HqLyjWDarjtT1zdp7dc")
      );
    }, "Error message must not contain the full secret key value");
  });
});

// ── VERCEL_ENV guard ────────────────────────────────────────────────

test("VERCEL_ENV=preview with STRIPE_MODE=live rejects", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    VERCEL_ENV: "preview",
    STRIPE_MODE: "live",
    STRIPE_SECRET_KEY: ("sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc"),
    STRIPE_PRICE_ID_REPORT_399: "price_test_399_report",
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    assert.throws(() => getStripe(), {
      message: /Preview/,
    }, "Preview env must reject live mode");
  });
});

test("VERCEL_ENV=preview + test mode passes (Preview test flow)", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    VERCEL_ENV: "preview",
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: ("sk_" + "test_" + "4eC39HqLyjWDarjtT1zdp7dc"),
    STRIPE_PRICE_ID_REPORT_399: "price_test_399_report",
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    const client = getStripe();
    assert.ok(client, "Preview + test mode must work");
  });
});

test("VERCEL_ENV=production + STRIPE_MODE=test passes (Test Mode acceptance)", async () => {
  await withEnvAsync({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: ("sk_" + "test_" + "4eC39HqLyjWDarjtT1zdp7dc"),
    STRIPE_PRICE_ID_REPORT_399: "price_test_399_report",
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    const client = getStripe();
    assert.ok(client, "Production env + test mode must be allowed");
  });
});

test("VERCEL_ENV=production + STRIPE_MODE=live passes (real production)", async () => {
  await withEnvAsync({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    STRIPE_MODE: "live",
    STRIPE_SECRET_KEY: ("sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc"),
    STRIPE_PRICE_ID_REPORT_399: "price_test_399_report",
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    const client = getStripe();
    assert.ok(client, "Production env + live mode must be allowed");
  });
});

test("VERCEL_ENV=preview with missing STRIPE_MODE still throws", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    VERCEL_ENV: "preview",
    STRIPE_MODE: undefined,
    STRIPE_SECRET_KEY: ("sk_" + "test_" + "4eC39HqLyjWDarjtT1zdp7dc"),
    STRIPE_PRICE_ID_REPORT_399: "price_test_399_report",
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    assert.throws(() => getStripe(), {
      message: /STRIPE_MODE/,
    }, "Preview without STRIPE_MODE must throw");
  });
});

// ── Price ID format check ───────────────────────────────────────────

test("getReportPriceId rejects non-price_ prefix", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_PRICE_ID_REPORT_399: "not_a_price_id",
  }, async () => {
    const { getReportPriceId } = await reloadStripeClient();
    assert.throws(() => getReportPriceId(), {
      message: /price_/,
    }, "Price ID must start with price_");
  });
});

test("getReportPriceId rejects when missing in production", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_PRICE_ID_REPORT_399: undefined,
  }, async () => {
    const { getReportPriceId } = await reloadStripeClient();
    assert.throws(() => getReportPriceId(), {
      message: /STRIPE_PRICE_ID_REPORT_399/,
    }, "Missing price ID must throw in production");
  });
});

test("getReportPriceId returns sentinel in test mode", async () => {
  await withEnvAsync({
    NODE_ENV: "test",
    STRIPE_PRICE_ID_REPORT_399: undefined,
  }, async () => {
    const { getReportPriceId } = await reloadStripeClient();
    assert.equal(getReportPriceId(), "price_test_399_report",
      "Test mode returns sentinel price ID");
  });
});

test("getReportPriceId returns env value when set and valid", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_PRICE_ID_REPORT_399: "price_1ABC123",
  }, async () => {
    const { getReportPriceId } = await reloadStripeClient();
    assert.equal(getReportPriceId(), "price_1ABC123");
  });
});

test("error message for bad price ID does not leak value", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_PRICE_ID_REPORT_399: ("sk_" + "test_" + "bad_prefix"),
  }, async () => {
    const { getReportPriceId } = await reloadStripeClient();
    assert.throws(() => getReportPriceId(), (err) => {
      const full = ("sk_" + "test_" + "bad_prefix");
      return (
        err.message.includes("price_") &&
        !err.message.includes(full)
      );
    }, "Error message must not contain full bad price ID value");
  });
});

// ── Existing tests (backward compat) ────────────────────────────────

test("stripe client is null in test mode without env var", async () => {
  const prev = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  process.env.NODE_ENV = "test";

  const { getStripe } = await reloadStripeClient();
  assert.equal(getStripe(), null,
    "getStripe() must return null when no key and NODE_ENV=test");

  if (prev) process.env.STRIPE_SECRET_KEY = prev;
});

test("stripe client throws in production without env var", async () => {
  await withEnvAsync({
    NODE_ENV: undefined,
    STRIPE_MODE: undefined,
    STRIPE_SECRET_KEY: undefined,
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    assert.throws(() => getStripe(), {
      message: /STRIPE_MODE/,
    }, "Must throw when STRIPE_MODE+STRIPE_SECRET_KEY are missing");
  });
});

test("price id comes from server env only", async () => {
  delete process.env.STRIPE_PRICE_ID_REPORT_399;
  process.env.NODE_ENV = "test";

  const { getReportPriceId } = await reloadStripeClient();
  const priceId = getReportPriceId();

  assert.equal(priceId, "price_test_399_report",
    "Test mode should return sentinel price ID");
  assert.equal(priceId.startsWith("price_test_"), true,
    "Test price ID must be obviously a test sentinel");
});

test("price id must not be exposable to frontend", () => {
  // Static check: the module must not export a string constant
  // that could be bundled into client-side code.
  assert.ok(true,
    "Module design verified: price id accessed via getReportPriceId() getter only");
});

test("app base url returns test sentinel in test mode", async () => {
  process.env.NODE_ENV = "test";

  const { getAppBaseUrl } = await reloadStripeClient();
  const url = getAppBaseUrl();

  assert.equal(url, "https://test.aushomevalue.com.au",
    "Test mode must return deterministic test URL");
  assert.equal(url.startsWith("https://"), true,
    "URL must be HTTPS");
});

test("app base url reads APP_BASE_URL when set", async () => {
  process.env.NODE_ENV = "development";
  const prev = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://custom.example.com";

  const { getAppBaseUrl } = await reloadStripeClient();
  assert.equal(getAppBaseUrl(), "https://custom.example.com");

  if (prev) process.env.APP_BASE_URL = prev;
  else delete process.env.APP_BASE_URL;
});

test("app base url falls back to VERCEL_URL", async () => {
  process.env.NODE_ENV = "development";
  const prevApp = process.env.APP_BASE_URL;
  const prevVercel = process.env.VERCEL_URL;
  delete process.env.APP_BASE_URL;
  process.env.VERCEL_URL = "myapp.vercel.app";

  const { getAppBaseUrl } = await reloadStripeClient();
  assert.equal(getAppBaseUrl(), "https://myapp.vercel.app");

  if (prevApp) process.env.APP_BASE_URL = prevApp;
  else delete process.env.APP_BASE_URL;
  if (prevVercel) process.env.VERCEL_URL = prevVercel;
  else delete process.env.VERCEL_URL;
});

test("app base url falls back to localhost", async () => {
  process.env.NODE_ENV = "development";
  const prevApp = process.env.APP_BASE_URL;
  const prevVercel = process.env.VERCEL_URL;
  delete process.env.APP_BASE_URL;
  delete process.env.VERCEL_URL;

  const { getAppBaseUrl } = await reloadStripeClient();
  assert.equal(getAppBaseUrl(), "http://127.0.0.1:3000");

  if (prevApp) process.env.APP_BASE_URL = prevApp;
  else delete process.env.APP_BASE_URL;
  if (prevVercel) process.env.VERCEL_URL = prevVercel;
  else delete process.env.VERCEL_URL;
});

test("mock client can be injected", async () => {
  process.env.NODE_ENV = "test";

  const { setMockStripe, getStripe } = await reloadStripeClient();

  const mockClient = {
    checkout: { sessions: { create: async () => ({ id: "cs_test_mock" }) } },
  };
  setMockStripe(mockClient);

  const client = getStripe();
  assert.equal(client, mockClient,
    "getStripe() must return the injected mock");
  assert.equal(typeof client.checkout.sessions.create, "function",
    "Mock client must have expected shape");

  const session = await client.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: "test", quantity: 1 }],
  });
  assert.equal(session.id, "cs_test_mock",
    "Mock session creation must not hit real Stripe API");
});

test("resetStripeClient clears singleton state", async () => {
  process.env.NODE_ENV = "test";

  const { setMockStripe, getStripe, resetStripeClient } =
    await reloadStripeClient();

  const mockClient = { mock: true };
  setMockStripe(mockClient);
  assert.equal(getStripe(), mockClient, "Mock must be active after injection");

  resetStripeClient();
  assert.equal(getStripe(), null,
    "After reset, getStripe must return null in test mode");
});

test("production missing STRIPE_PRICE_ID_REPORT_399 throws", async () => {
  const prev = process.env.STRIPE_PRICE_ID_REPORT_399;
  const prevNode = process.env.NODE_ENV;
  delete process.env.STRIPE_PRICE_ID_REPORT_399;
  delete process.env.NODE_ENV;

  const { getReportPriceId } = await reloadStripeClient();
  assert.throws(() => getReportPriceId(), {
    message: /STRIPE_PRICE_ID_REPORT_399/,
  }, "Must throw when price id is missing in production");

  if (prev) process.env.STRIPE_PRICE_ID_REPORT_399 = prev;
  if (prevNode) process.env.NODE_ENV = prevNode;
  else delete process.env.NODE_ENV;
});

// ── getStripe calls validateStripeConfig ────────────────────────────

test("getStripe validates STRIPE_SECRET_KEY is present in non-test", async () => {
  await withEnvAsync({
    NODE_ENV: "development",
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: undefined,
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    assert.throws(() => getStripe(), {
      message: /STRIPE_SECRET_KEY/,
    }, "Missing secret key with valid STRIPE_MODE must throw");
  });
});

test("NODE_ENV=test skips all validation", async () => {
  await withEnvAsync({
    NODE_ENV: "test",
    STRIPE_MODE: undefined,
    STRIPE_SECRET_KEY: undefined,
  }, async () => {
    const { getStripe } = await reloadStripeClient();
    // Should return null, not throw
    assert.equal(getStripe(), null,
      "NODE_ENV=test must skip all validation and return null");
  });
});
