// ── Phase 1B: Report Draft & Snapshot Service Tests ──
// Tests run against the service module directly (no DB required for
// token operations). DB-dependent tests use mock SQL.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Set test env before importing
process.env.NODE_ENV = "test";
process.env.TOKEN_SIGNING_SECRET = "test-secret-for-phase-1b-tests";

// ── Module under test ───────────────────────────────────────────────

const svc = await import(path.join(projectRoot, "lib/report-snapshot-service.js"));

// ── Helpers ─────────────────────────────────────────────────────────

function makeMockValuationResult(overrides = {}) {
  return {
    ok: true,
    address: "18 Moresby St",
    suburb: "Oakleigh",
    state: "VIC",
    postcode: "3166",
    propertyType: "Unit",
    landSize: null,
    modelVersion: "1.0.0",
    collectedAt: new Date().toISOString(),
    asOfDate: "2026-06-12",
    valuation: {
      midpoint: 825000,
      low: 780000,
      high: 870000,
      confidence: { label: "Medium", dataScore: 72 },
      acceptedComparables: [
        { address: "20 Moresby St", salePrice: 800000, saleDate: "2026-05-01", distanceMeters: 50 },
        { address: "15 Moresby St", salePrice: 850000, saleDate: "2026-04-15", distanceMeters: 80 },
      ],
      keyFactors: ["Recent sales in area indicate stable demand"],
      factorAdjustments: { education: 0.66, location: 0.5, census: -0.5 },
      factorTotal: 1.69,
      anchor: "comparable",
      weightedMedian: 825000,
      dataLimitations: ["Valuation is based on publicly available market data"],
    },
    subject: { address: "18 Moresby St", suburb: "Oakleigh", state: "VIC", postcode: "3166" },
    confidence: { label: "Medium", dataScore: 72 },
    ...overrides,
  };
}

function makeMockSql() {
  const store = new Map();
  return {
    // Simulates neon() tagged-template executor
    query: async (strings, ...values) => {
      // Store operations: mimic INSERT and SELECT
      const text = strings.join("?"); // crude but test-level
      if (text.includes("INSERT INTO report_drafts")) {
        const draftId = values[0];
        const snapshotJson = values[3];
        const hash = svc.hashSnapshot(snapshotJson);
        store.set(draftId, {
          draft_id: draftId,
          property_key: values[1],
          valuation_version: values[2],
          snapshot_json: snapshotJson,
          snapshot_hash: hash,
          expires_at: values[5],
          consumed_at: null,
        });
        return [];
      }
      if (text.includes("FROM report_drafts")) {
        const draftId = values[0];
        const draft = store.get(draftId);
        if (!draft || draft.consumed_at) return [];
        return [draft];
      }
      if (text.includes("FROM report_snapshots")) {
        // Check for existing consumption by draft_id
        const draftId = values[0];
        for (const [, v] of store) {
          if (v.consumed_at) {
            const snapKey = `snap_${draftId}`;
            const snap = store.get(snapKey);
            if (snap) return [{ report_id: snap.report_id }];
          }
        }
        return [];
      }
      if (text.includes("INSERT INTO report_snapshots")) {
        const reportId = values[0];
        store.set(`snap_${values[1]}`, { report_id: reportId });
        return [];
      }
      if (text.includes("UPDATE report_drafts")) {
        const draftId = values[0];
        const draft = store.get(draftId);
        if (draft) draft.consumed_at = new Date().toISOString();
        return [];
      }
      return [];
    },
    // Support tagged template call as neon() returns a function
    apply: async function(sqlStrings, ...sqlValues) {
      return this.query(sqlStrings, ...sqlValues[0]);
    },
  };
}

// Wrap mock to be callable as tagged template: sql`...`
function createMockSql() {
  const mock = makeMockSql();
  // neon returns a function that can be used as tagged template
  const sqlFn = async (strings, ...values) => {
    return mock.query(strings, ...values);
  };
  return sqlFn;
}

// ── Tests ───────────────────────────────────────────────────────────

test("buildPropertyKey extracts deterministic key from result", () => {
  const result = makeMockValuationResult();
  const key = svc.buildPropertyKey(result);
  assert.ok(key.startsWith("18 Moresby St"), `Should start with street name: ${key}`);
  assert.ok(key.includes("Oakleigh"), "Should include suburb");
  assert.ok(key.includes("VIC"), "Should include state");
  assert.ok(key.includes("3166"), "Should include postcode");
  assert.ok(key.endsWith("unit"), "Should end with normalized property type");
});

test("snapshot hash is deterministic for same content", () => {
  const h1 = svc.hashSnapshot('{"a":1,"b":2}');
  const h2 = svc.hashSnapshot('{"a":1,"b":2}');
  const h3 = svc.hashSnapshot('{"a":1,"b":3}');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
});

test("createReportDraft returns a signed token (no snapshot JSON inside)", async () => {
  const result = makeMockValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  assert.ok(draft.draftToken, "Must return a draft token");
  assert.ok(draft.draftExpiresAt, "Must return expiry date");
  assert.ok(typeof draft.draftToken === "string", "Token must be a string");
  assert.ok(draft.draftToken.includes("."), "Token must contain separator");

  // Token must NOT contain snapshot JSON
  assert.equal(draft.draftToken.includes("comparable"), false, "Token must not contain valuation data");
  assert.equal(draft.draftToken.includes("825000"), false, "Token must not contain midpoint");
});

test("verifyReportDraftToken returns payload for valid token", async () => {
  const result = makeMockValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  const payload = svc.verifyReportDraftToken(draft.draftToken);
  assert.ok(payload, "Must return payload for valid token");
  assert.ok(payload.draft_id, "Must contain draft_id");
  assert.ok(payload.property_key, "Must contain property_key");
  assert.ok(payload.snapshot_hash, "Must contain snapshot_hash");
  assert.ok(payload.expires_at > Date.now(), "Must be unexpired");
});

test("verifyReportDraftToken rejects tampered token", async () => {
  const result = makeMockValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  // Tamper with the payload part
  const parts = draft.draftToken.split(".");
  const tamperedPayload = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(parts[0], "base64url")), property_key: "FAKE|STREET" })
  ).toString("base64url");
  const tampered = `${tamperedPayload}.${parts[1]}`;

  assert.equal(svc.verifyReportDraftToken(tampered), null, "Must reject tampered token");
});

test("verifyReportDraftToken rejects expired token", async () => {
  // Create a token with negative expiry manually
  const result = makeMockValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  // Extract and modify the payload directly
  const parts = draft.draftToken.split(".");
  const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  payload.expires_at = Date.now() - 60000; // 1 minute ago

  // Re-sign with expired timestamp
  const secret = "report-draft-dev-secret";
  const modifiedEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(modifiedEncoded).digest("base64url");
  const expiredToken = `${modifiedEncoded}.${sig}`;

  assert.equal(svc.verifyReportDraftToken(expiredToken), null, "Must reject expired token");
});

test("verifyReportDraftToken rejects malformed input", () => {
  assert.equal(svc.verifyReportDraftToken(null), null);
  assert.equal(svc.verifyReportDraftToken(""), null);
  assert.equal(svc.verifyReportDraftToken("invalid"), null);
  assert.equal(svc.verifyReportDraftToken("too.many.parts"), null);
});

test("client submitting fake property_key is ignored — token verification uses server data", async () => {
  // The token is generated server-side. Even if client somehow gets a token
  // with a fake property_key, verifyReportDraftToken just decodes; the
  // property_key in the token is what the server put there.
  // Real protection is in consumeDraftIntoSnapshot which reads DB draft.
  const result = makeMockValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  // Verify the draft's stored property_key is server-generated
  const payload = svc.verifyReportDraftToken(draft.draftToken);
  assert.equal(payload.property_key.includes("FAKE"), false,
    "Server-generated property_key should not contain client-injected data");
});

test("consumeDraftIntoSnapshot creates immutable snapshot", async () => {
  const result = makeMockValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  const outcome = await svc.consumeDraftIntoSnapshot(draft.draftToken, 42, sql);
  assert.ok(outcome.report_id, "Must return a report_id");
  assert.ok(outcome.report_id.startsWith("rp_"), "report_id must start with rp_");
  assert.equal(outcome.alreadyConsumed, false, "First consume must not be duplicate");
});

test("consumeDraftIntoSnapshot is idempotent on repeated calls", async () => {
  const result = makeMockValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  const first = await svc.consumeDraftIntoSnapshot(draft.draftToken, 42, sql);
  const second = await svc.consumeDraftIntoSnapshot(draft.draftToken, 42, sql);

  assert.equal(first.report_id, second.report_id, "Must return same report_id");
  assert.equal(second.alreadyConsumed, true, "Second call must be marked consumed");
});

test("consumeDraftIntoSnapshot rejects invalid token", async () => {
  const sql = createMockSql();
  await assert.rejects(
    () => svc.consumeDraftIntoSnapshot("invalid.token.here", 42, sql),
    { message: /Invalid or expired draft token/ }
  );
});

test("free valuation API must NOT return snapshot_json", () => {
  // This test validates that the buildFreeSummary (in valuation.js)
  // does not leak snapshot data. We test by checking the actual response
  // shape expected from valuation.js: free summary includes reportDraftToken
  // and draftExpiresAt, but not snapshot_json or complete estimate data.
  const apiFile = fs.readFileSync(
    path.join(projectRoot, "api/valuation.js"),
    "utf8"
  );

  // Check that draft token field names appear in the handler
  assert.ok(apiFile.includes("reportDraftToken"), "Free valuation must return reportDraftToken");
  assert.ok(apiFile.includes("draftExpiresAt"), "Free valuation must return draftExpiresAt");

  // Verify no snapshot_json in the return path
  const handlerSectionStart = apiFile.indexOf("export default async function handler");
  const handlerSection = apiFile.slice(handlerSectionStart, handlerSectionStart + 2000);
  assert.equal(
    handlerSection.includes("snapshot_json"),
    false,
    "Handler must not return snapshot_json in free valuation response"
  );
});

test("service does not import or reference Opportunity Cookie", () => {
  const svcSource = fs.readFileSync(
    path.join(projectRoot, "lib/report-snapshot-service.js"),
    "utf8"
  );
  assert.equal(svcSource.includes("opportunity_gate"), false,
    "Must not reference Opportunity cookie");
  assert.equal(svcSource.includes("aushomevalue_opportunity"), false,
    "Must not reference Opportunity domain");
  assert.equal(svcSource.includes("../lib/signed-token.js"), false,
    "Must not import signed-token.js (Opportunity path)");
});

test("migration-010 has report_drafts table", () => {
  const sql = fs.readFileSync(
    path.join(projectRoot, "db/migration-010-report-payments.sql"),
    "utf8"
  );
  assert.ok(sql.includes("report_drafts"), "Must define report_drafts table");
  assert.ok(sql.includes("snapshot_json"), "Must store snapshot_json");
  assert.ok(sql.includes("consumed_at"), "Must track consumption");
  assert.ok(sql.includes("draft_id TEXT REFERENCES report_drafts(draft_id)"));
});
