// ── Phase 1C2: Report Checkout Builder Tests ──
//
// Pure-function tests for buildReportCheckoutParams().
// No database, no Stripe API, no network.

import assert from "node:assert/strict";
import test from "node:test";

// Set test mode before any imports
process.env.NODE_ENV = "test";

import {
  buildReportCheckoutParams,
  buildPurchaseIntentKey,
  PRODUCT_CODE,
} from "../lib/report-checkout-builder.js";

// ── Constants ───────────────────────────────────────────────────────

const TEST_REPORT_ID = "rp_1712345678901_a1b2c3d4e5f6";
const TEST_PURCHASE_KEY = "rp_abc:42:valuation_report_399";
const TEST_CONTACT_ID = 42;

// ── Tests ───────────────────────────────────────────────────────────

test("mode is payment (fixed)", () => {
  const params = buildReportCheckoutParams({
    reportId: TEST_REPORT_ID,
    purchaseIntentKey: TEST_PURCHASE_KEY,
  });
  assert.equal(params.mode, "payment");
});

test("price id comes from getReportPriceId, not from client", () => {
  // Client sends a bogus price override — must be ignored
  const clientInput = { price_id: "price_client_sneaky", amount: 9999 };
  const params = buildReportCheckoutParams(
    { reportId: TEST_REPORT_ID, purchaseIntentKey: TEST_PURCHASE_KEY },
    clientInput
  );

  assert.equal(params.line_items[0].price, "price_test_399_report",
    "Must use getReportPriceId() value, not client input");
  assert.equal(params.line_items[0].quantity, 1, "Quantity must be 1");

  // Verify client input never leaks into params
  const paramStr = JSON.stringify(params);
  assert.equal(paramStr.includes("price_client_sneaky"), false,
    "Client-supplied price ID must not appear in params");
  assert.equal(paramStr.includes("9999"), false,
    "Client-supplied amount must not appear in params");
});

test("quantity is 1 (fixed)", () => {
  const params = buildReportCheckoutParams({
    reportId: TEST_REPORT_ID,
    purchaseIntentKey: TEST_PURCHASE_KEY,
  });
  assert.equal(params.line_items[0].quantity, 1);
});

test("success_url uses getAppBaseUrl with report_id, no Stripe placeholder", () => {
  const params = buildReportCheckoutParams({
    reportId: TEST_REPORT_ID,
    purchaseIntentKey: TEST_PURCHASE_KEY,
  });

  assert.ok(params.success_url.startsWith("https://test.aushomevalue.com.au"),
    "Must start with test base URL");
  assert.ok(params.success_url.includes("/report-success.html"),
    "Must point to report-success page");
  assert.ok(params.success_url.includes(`report_id=${encodeURIComponent(TEST_REPORT_ID)}`),
    "Must contain report_id query param");
  assert.ok(!params.success_url.includes("{CHECKOUT_SESSION_ID}"),
    "Must NOT contain Stripe session_id placeholder");
  assert.ok(!params.success_url.includes("email"),
    "success_url must not contain email");
  assert.ok(!params.success_url.includes("leadContactId"),
    "success_url must not contain leadContactId");
  assert.ok(!params.success_url.includes("cs_test_"),
    "success_url must not contain Stripe session ID");
});

test("cancel_url uses getAppBaseUrl with payment=cancelled and report_id", () => {
  const params = buildReportCheckoutParams({
    reportId: TEST_REPORT_ID,
    purchaseIntentKey: TEST_PURCHASE_KEY,
  });

  assert.ok(params.cancel_url.startsWith("https://test.aushomevalue.com.au"),
    "Must start with test base URL");
  assert.ok(params.cancel_url.includes("payment=cancelled"),
    "Must indicate cancelled payment");
  assert.ok(params.cancel_url.includes(`report_id=${encodeURIComponent(TEST_REPORT_ID)}`),
    "Must contain report_id query param");
  assert.ok(!params.cancel_url.includes("email"),
    "cancel_url must not contain email");
  assert.ok(!params.cancel_url.includes("leadContactId"),
    "cancel_url must not contain leadContactId");
  assert.ok(!params.cancel_url.includes("{CHECKOUT_SESSION_ID}"),
    "cancel_url must not contain Stripe placeholder");
});

test("special characters in reportId are safely encoded in URLs", () => {
  const specialId = "rp_1712345678901_a1:b2c3d4e5f6";
  const params = buildReportCheckoutParams({
    reportId: specialId,
    purchaseIntentKey: `special:1:valuation_report_399`,
  });

  // The colon in the reportId should be percent-encoded
  assert.ok(params.success_url.includes(encodeURIComponent(specialId)),
    "Special chars in reportId must be percent-encoded in success_url");
  assert.ok(params.cancel_url.includes(encodeURIComponent(specialId)),
    "Special chars in reportId must be percent-encoded in cancel_url");
  // Raw colon in URL is ambiguous — confirm it's encoded
  assert.ok(!params.success_url.includes(specialId),
    "Raw special chars must not appear unencoded in success_url");
  assert.ok(!params.cancel_url.includes(specialId),
    "Raw special chars must not appear unencoded in cancel_url");
});

test("client-supplied success_url/cancel_url are ignored", () => {
  const clientInput = {
    success_url: "https://evil.com/phish",
    cancel_url: "https://evil.com/cancel",
  };
  const params = buildReportCheckoutParams(
    { reportId: TEST_REPORT_ID, purchaseIntentKey: TEST_PURCHASE_KEY },
    clientInput
  );

  assert.ok(params.success_url.startsWith("https://test.aushomevalue.com.au"),
    "success_url must be server-generated, not from client");
  assert.ok(params.cancel_url.startsWith("https://test.aushomevalue.com.au"),
    "cancel_url must be server-generated, not from client");
  assert.ok(!params.success_url.includes("evil.com"),
    "Client-supplied success_url must be ignored");
  assert.ok(!params.cancel_url.includes("evil.com"),
    "Client-supplied cancel_url must be ignored");
});

test("metadata contains only report_id, purchase_intent_key, product_code", () => {
  const params = buildReportCheckoutParams({
    reportId: TEST_REPORT_ID,
    purchaseIntentKey: TEST_PURCHASE_KEY,
  });

  const meta = params.metadata;
  assert.ok(meta, "Metadata must exist");

  const keys = Object.keys(meta).sort();
  assert.deepEqual(keys, ["product_code", "purchase_intent_key", "report_id"],
    "Metadata must have exactly three keys in the correct set");

  assert.equal(meta.report_id, TEST_REPORT_ID);
  assert.equal(meta.purchase_intent_key, TEST_PURCHASE_KEY);
  assert.equal(meta.product_code, "valuation_report_399");
});

test("metadata does not contain email, phone, address, or valuation data", () => {
  const params = buildReportCheckoutParams({
    reportId: TEST_REPORT_ID,
    purchaseIntentKey: TEST_PURCHASE_KEY,
  });

  const metaStr = JSON.stringify(params.metadata).toLowerCase();
  const forbidden = ["email", "phone", "address",
    "estimate", "suburb", "postcode", "state", "property",
    "name", "midpoint", "low", "high", "comparables"];

  for (const word of forbidden) {
    assert.equal(metaStr.includes(word), false,
      `Metadata must not contain "${word}"`);
  }
});

test("metadata is purely server-generated — client input ignored", () => {
  // Malicious client sends metadata with extra keys
  const clientInput = {
    metadata: {
      email: "hacker@evil.com",
      phone: "+61400000000",
      address: "123 Fake St",
      report_id: "rp_FAKE",
    },
  };

  const params = buildReportCheckoutParams(
    { reportId: TEST_REPORT_ID, purchaseIntentKey: TEST_PURCHASE_KEY },
    clientInput
  );

  assert.equal(params.metadata.report_id, TEST_REPORT_ID,
    "report_id must be server value, not client-supplied");
  assert.equal(params.metadata.email, undefined,
    "Client-supplied email must not appear in metadata");
  assert.equal(params.metadata.phone, undefined,
    "Client-supplied phone must not appear in metadata");
  assert.equal(params.metadata.address, undefined,
    "Client-supplied address must not appear in metadata");
});

test("missing reportId throws", () => {
  assert.throws(() => buildReportCheckoutParams({
    purchaseIntentKey: TEST_PURCHASE_KEY,
  }), { message: /reportId/ });
});

test("missing purchaseIntentKey throws", () => {
  assert.throws(() => buildReportCheckoutParams({
    reportId: TEST_REPORT_ID,
  }), { message: /purchaseIntentKey/ });
});

test("buildPurchaseIntentKey creates correct key", () => {
  const key = buildPurchaseIntentKey(TEST_REPORT_ID, TEST_CONTACT_ID);
  assert.equal(key, "rp_1712345678901_a1b2c3d4e5f6:42:valuation_report_399");
  assert.ok(key.endsWith(":valuation_report_399"),
    "Key must end with product code");
});

test("buildPurchaseIntentKey handles string lead contact id", () => {
  const key = buildPurchaseIntentKey(TEST_REPORT_ID, "99");
  assert.equal(key, "rp_1712345678901_a1b2c3d4e5f6:99:valuation_report_399");
});

test("buildPurchaseIntentKey throws on missing args", () => {
  assert.throws(() => buildPurchaseIntentKey(), { message: /reportId/ });
  assert.throws(() => buildPurchaseIntentKey(TEST_REPORT_ID), { message: /leadContactId/ });
});

test("PRODUCT_CODE is constant", () => {
  assert.equal(PRODUCT_CODE, "valuation_report_399");
});

test("output shape matches Stripe.Checkout.SessionCreateParams", () => {
  const params = buildReportCheckoutParams({
    reportId: TEST_REPORT_ID,
    purchaseIntentKey: TEST_PURCHASE_KEY,
  });

  // Structural assertions — these match the Stripe SDK interface
  assert.equal(typeof params, "object");
  assert.equal(params.mode, "payment");
  assert.ok(Array.isArray(params.line_items));
  assert.equal(params.line_items.length, 1);
  assert.equal(typeof params.line_items[0].price, "string");
  assert.equal(params.line_items[0].quantity, 1);
  assert.equal(typeof params.success_url, "string");
  assert.equal(typeof params.cancel_url, "string");
  assert.equal(typeof params.metadata, "object");
  assert.equal(params.metadata.product_code, "valuation_report_399");

  // Confirm no extra top-level keys that don't belong
  const topKeys = Object.keys(params).sort();
  assert.deepEqual(topKeys,
    ["cancel_url", "line_items", "metadata", "mode", "success_url"].sort(),
    "Params must only contain expected Stripe keys");
});
