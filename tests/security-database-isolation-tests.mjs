import assert from "node:assert/strict";
import test from "node:test";

import { assertDatabaseEnvironment } from "../api/_db.js";
import valuationHandler from "../api/valuation.js";
import valuationLeadHandler from "../api/valuation-lead.js";
import simpleReportHandler from "../api/simple-report.js";

const databaseUrl = (host) => `${["post", "gresql"].join("")}://${host}/database`;

test("database selection is strictly isolated by Vercel environment", () => {
  const previewUrl = databaseUrl("preview.invalid");
  const productionUrl = databaseUrl("production.invalid");

  assert.equal(assertDatabaseEnvironment({
    VERCEL_ENV: "preview",
    PREVIEW_DATABASE_URL: previewUrl,
    PREVIEW_DATABASE_HOST: "preview.invalid",
  }), previewUrl);

  assert.throws(
    () => assertDatabaseEnvironment({ VERCEL_ENV: "preview", PREVIEW_DATABASE_HOST: "preview.invalid" }),
    /PREVIEW_DATABASE_URL/
  );
  assert.throws(
    () => assertDatabaseEnvironment({ VERCEL_ENV: "preview", PREVIEW_DATABASE_URL: previewUrl }),
    /PREVIEW_DATABASE_HOST/
  );
  assert.throws(
    () => assertDatabaseEnvironment({
      VERCEL_ENV: "preview",
      PREVIEW_DATABASE_URL: previewUrl,
      PREVIEW_DATABASE_HOST: "different.invalid",
    }),
    /not approved/
  );
  assert.throws(
    () => assertDatabaseEnvironment({ VERCEL_ENV: "preview", DATABASE_URL: productionUrl }),
    /PREVIEW_DATABASE_URL/
  );

  assert.equal(assertDatabaseEnvironment({
    VERCEL_ENV: "production",
    DATABASE_URL: productionUrl,
  }), productionUrl);
  assert.equal(assertDatabaseEnvironment({
    VERCEL_ENV: "production",
    DATABASE_URL: productionUrl,
    PREVIEW_DATABASE_URL: previewUrl,
    PREVIEW_DATABASE_HOST: "preview.invalid",
  }), productionUrl);
  assert.throws(
    () => assertDatabaseEnvironment({
      VERCEL_ENV: "production",
      PREVIEW_DATABASE_URL: previewUrl,
      PREVIEW_DATABASE_HOST: "preview.invalid",
    }),
    /DATABASE_URL/
  );
});

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

async function assertPreviewFailsClosed(handler, body) {
  const previous = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    PREVIEW_DATABASE_URL: process.env.PREVIEW_DATABASE_URL,
    PREVIEW_DATABASE_HOST: process.env.PREVIEW_DATABASE_HOST,
  };
  const productionUrl = databaseUrl("production.invalid");
  process.env.VERCEL_ENV = "preview";
  process.env.DATABASE_URL = productionUrl;
  delete process.env.PREVIEW_DATABASE_URL;
  process.env.PREVIEW_DATABASE_HOST = "preview.invalid";

  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args.map(String).join(" "));
  try {
    const response = responseRecorder();
    await handler({ method: "POST", body, query: {}, headers: {} }, response);
    assert.equal(response.statusCode, 500);
    const publicOutput = JSON.stringify(response.body);
    const logOutput = logged.join("\n");
    assert.doesNotMatch(publicOutput, /production\.invalid|preview\.invalid/i);
    assert.doesNotMatch(logOutput, /production\.invalid|preview\.invalid/i);
  } finally {
    console.error = originalError;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("valuation API fails closed without a Preview database", async () => {
  await assertPreviewFailsClosed(valuationHandler, { address: "Test address" });
});

test("registered valuation API fails closed without a Preview database", async () => {
  await assertPreviewFailsClosed(valuationLeadHandler, { address: "Test address", leadContactId: 1 });
});

test("simple report API fails closed without a Preview database", async () => {
  await assertPreviewFailsClosed(simpleReportHandler, { address: "Test address", leadContactId: 1 });
});

test("hotfix sources do not implement Preview-to-Production fallback or expose raw errors", async () => {
  const fs = await import("node:fs");
  const valuationService = fs.readFileSync(new URL("../lib/valuation-service.js", import.meta.url), "utf8");
  const valuationApi = fs.readFileSync(new URL("../api/valuation.js", import.meta.url), "utf8");
  const valuationLeadApi = fs.readFileSync(new URL("../api/valuation-lead.js", import.meta.url), "utf8");
  const simpleReportApi = fs.readFileSync(new URL("../api/simple-report.js", import.meta.url), "utf8");

  assert.match(valuationService, /assertDatabaseEnvironment\(\)/);
  assert.doesNotMatch(valuationService, /PREVIEW_DATABASE_URL\s*\|\|\s*process\.env\.DATABASE_URL/);
  assert.doesNotMatch(valuationApi, /console\.error\(error\)/);
  assert.doesNotMatch(valuationApi, /error:\s*error\.message/);
  assert.doesNotMatch(valuationLeadApi, /console\.error\([^\n]*err\)/);
  assert.doesNotMatch(simpleReportApi, /console\.error\([^\n]*err\)/);
});
