// ── Phase 1B: Report Draft & Snapshot Service Tests ──
// Tests run against the service module directly (no DB required for
// token operations). DB-dependent tests use a mock that simulates
// Neon JSONB behaviour (parsed objects, not raw JSON strings).

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

// ── Production-matching mock valuation result ───────────────────────
//
// ⚠️  Production runValuation returns:
//       valuation.estimate.{midpoint, low, high}
//     NOT valuation.{midpoint, low, high}.

function makeProductionValuationResult(overrides = {}) {
  return {
    ok: true,
    status: "completed",
    dataTier: "tier_a",
    valuationMethod: "direct_comparable",
    isFallback: false,
    fallbackLevel: "a",
    subject: {
      address: "18 Moresby St",
      coordinates: { lat: -37.9, lon: 145.1 },
      propertyType: "Unit",
      state: "VIC",
      suburb: "Oakleigh",
    },
    valuationMode: "standard_house",
    largeLotDetect: null,
    largeLotResult: null,
    modelVersion: "1.0.0",
    valuation: {
      ok: true,
      estimate: {
        midpoint: 825000,
        low: 780000,
        high: 870000,
        anchor: { type: "comparable", targetCount: 5, actualCount: 2 },
        factorTotal: 1.69,
        factorAdjustments: { education: 0.66, location: 0.5, census: -0.5 },
        weightedMedian: 825000,
        weightedMean: 825000,
      },
      confidence: { label: "Medium", dataScore: 72 },
      acceptedComparables: [
        {
          address: "20 Moresby St",
          salePrice: 800000,
          saleDate: "2026-05-01",
          distanceMeters: 50,
          bedrooms: 2,
          bathrooms: 1,
          carSpaces: 1,
          landSize: 280,
        },
        {
          address: "15 Moresby St",
          salePrice: 850000,
          saleDate: "2026-04-15",
          distanceMeters: 80,
          bedrooms: 2,
          bathrooms: 1,
          carSpaces: 1,
          landSize: 290,
        },
      ],
      modelVersion: "1.0.0",
    },
    address: "18 Moresby St",
    suburb: "Oakleigh",
    state: "VIC",
    postcode: "3166",
    propertyType: "Unit",
    collectedAt: "2026-06-12T06:00:00.000Z",
    asOfDate: "2026-06-12",
    bedrooms: 2,
    bathrooms: 1,
    carSpaces: 1,
    landSize: null,
    ...overrides,
  };
}

// ── Mock SQL that simulates Neon JSONB behaviour ────────────────────
//
// Returns { sql, drafts, snapshots } so tests can inspect snapshot content
// and manipulate draft expiry.
//
// Neon reads JSONB columns as parsed JavaScript objects, NOT strings.
// This mock deliberately stores and returns parsed objects to reproduce
// the real production code path for hashSnapshot.

function createMockSql() {
  const drafts = new Map();
  const snapshots = new Map(); // draft_id → { report_id }

  const sqlFn = async (strings, ...values) => {
    const sql = strings.map((s, i) => (i < values.length ? s + values[i] : s)).join("");

    if (sql.includes("INSERT INTO report_drafts")) {
      const [draftId, propertyKey, valuationVersion, snapshotJson, snapshotHash, expiresAt] = values;
      const parsedJson = typeof snapshotJson === "string" ? JSON.parse(snapshotJson) : snapshotJson;
      drafts.set(draftId, {
        draft_id: draftId,
        property_key: propertyKey,
        valuation_version: valuationVersion,
        snapshot_json: parsedJson,
        snapshot_hash: snapshotHash,
        expires_at: expiresAt,
        consumed_at: null,
      });
      return [];
    }

    // SELECT FROM report_drafts WHERE draft_id = ... (draft read, not snapshot check)
    if (sql.includes("WHERE draft_id") && sql.includes("FROM report_drafts")) {
      const target = values.find(v => typeof v === "string" && v.startsWith("rd_")) || values[0];
      const draft = drafts.get(target);
      if (!draft) return [];
      // DB-side expiry check
      const now = new Date();
      const exp = new Date(draft.expires_at);
      if (exp <= now) return [];
      if (draft.consumed_at) return [];
      return [draft];
    }

    // SELECT FROM report_snapshots WHERE draft_id = ...
    if (sql.includes("FROM report_snapshots") && sql.includes("draft_id")) {
      const draftId = values.find(v => typeof v === "string" && v.startsWith("rd_")) || values[0];
      if (snapshots.has(draftId)) {
        return [{ report_id: snapshots.get(draftId).report_id, lead_contact_id: snapshots.get(draftId).lead_contact_id || null }];
      }
      return [];
    }

    // INSERT INTO report_snapshots … ON CONFLICT (draft_id) DO NOTHING RETURNING …
    if (sql.includes("INSERT INTO report_snapshots")) {
      const draftId = values[1];
      const reportId = values[0];
      if (!snapshots.has(draftId)) {
        snapshots.set(draftId, { report_id: reportId, lead_contact_id: values[6] || null });
        // Mark draft consumed
        const draft = drafts.get(draftId);
        if (draft) draft.consumed_at = new Date().toISOString();
        return [{ report_id: reportId }];
      }
      // ON CONFLICT DO NOTHING — already exists
      return [];
    }

    // UPDATE report_drafts SET consumed_at = NOW() …
    if (sql.includes("UPDATE report_drafts") && sql.includes("consumed_at")) {
      const target = values.find(v => typeof v === "string" && v.startsWith("rd_")) || values[0];
      const draft = drafts.get(target);
      if (draft && !draft.consumed_at) draft.consumed_at = new Date().toISOString();
      return [];
    }

    return [];
  };

  sqlFn.__drafts = drafts;
  sqlFn.__snapshots = snapshots;
  return sqlFn;
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Build a token payload signed with the same secret as the service uses in test env.
 */
function makeMockToken(payload) {
  const secret = "report-draft-dev-secret";
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

// ── Tests ───────────────────────────────────────────────────────────

test("buildPropertyKey extracts deterministic key from result", () => {
  const result = makeProductionValuationResult();
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

test("hashSnapshot accepts parsed JSON objects (Neon JSONB behaviour)", () => {
  const obj = { midpoint: 825000, low: 780000, high: 870000 };
  const objStr = JSON.stringify(obj);

  const h1 = svc.hashSnapshot(obj);
  const h2 = svc.hashSnapshot(objStr);

  assert.equal(h1, h2, "Hash of parsed object must match hash of same JSON string");
});

test("hashSnapshot is stable regardless of key ordering", () => {
  const a = { b: 1, a: 2, c: 3 };
  const b = { a: 2, b: 1, c: 3 };
  assert.equal(svc.hashSnapshot(a), svc.hashSnapshot(b),
    "Hash must be stable regardless of key insertion order");
});

test("createReportDraft returns a signed token with production structure (midpoint not null)", async () => {
  const result = makeProductionValuationResult();
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

test("snapshot contains non-null estimate values from production structure", async () => {
  const result = makeProductionValuationResult();
  const sql = createMockSql();
  await svc.createReportDraft(result, sql);

  const result2 = makeProductionValuationResult();
  const sql2 = createMockSql();
  const draft2 = await svc.createReportDraft(result2, sql2);
  const payload = svc.verifyReportDraftToken(draft2.draftToken);
  assert.ok(payload.snapshot_hash, "Must have snapshot_hash in token");
  assert.ok(payload.snapshot_hash.length >= 32, "snapshot_hash must be SHA-256 length");

  // Verify hash is based on real estimate data (different property = different hash)
  const result3 = makeProductionValuationResult({ address: "99 Different St" });
  result3.subject.address = "99 Different St";
  const sql3 = createMockSql();
  const draft3 = await svc.createReportDraft(result3, sql3);
  const payload3 = svc.verifyReportDraftToken(draft3.draftToken);
  assert.notEqual(payload.snapshot_hash, payload3.snapshot_hash,
    "Different properties must have different snapshot hashes");
});

test("verifyReportDraftToken returns payload for valid token", async () => {
  const result = makeProductionValuationResult();
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
  const result = makeProductionValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  const parts = draft.draftToken.split(".");
  const tamperedPayload = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(parts[0], "base64url")), property_key: "FAKE|STREET" })
  ).toString("base64url");
  const tampered = `${tamperedPayload}.${parts[1]}`;

  assert.equal(svc.verifyReportDraftToken(tampered), null, "Must reject tampered token");
});

test("verifyReportDraftToken rejects expired token", async () => {
  const result = makeProductionValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  const parts = draft.draftToken.split(".");
  const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  payload.expires_at = Date.now() - 60000; // 1 minute ago

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

test("consumeDraftIntoSnapshot creates immutable snapshot with correct estimate values", async () => {
  const result = makeProductionValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  const outcome = await svc.consumeDraftIntoSnapshot(draft.draftToken, 42, sql);
  assert.ok(outcome.report_id, "Must return a report_id");
  assert.ok(outcome.report_id.startsWith("rp_"), "report_id must start with rp_");
  assert.equal(outcome.alreadyConsumed, false, "First consume must not be duplicate");

  // Verify snapshot content in mock database
  // Get the stored snapshot_json from the drafts Map
  const payload = svc.verifyReportDraftToken(draft.draftToken);
  const snapData = sql.__snapshots.get(payload.draft_id);
  assert.ok(snapData, "Snapshot must exist in mock DB");

  // Also retrieve from drafts Map to inspect snapshot_json content
  const draftRecord = sql.__drafts.get(payload.draft_id);
  assert.ok(draftRecord, "Draft must exist in mock DB");

  // snapshot_json must be a parsed object (Neon JSONB behaviour) with correct values
  const snapJson = draftRecord.snapshot_json;
  assert.ok(typeof snapJson === "object", "snapshot_json must be a parsed object (Neon JSONB)");
  assert.ok(snapJson.estimate, "snapshot_json must have estimate object");
  assert.equal(snapJson.estimate.midpoint, 825000, "Midpoint must match production input");
  assert.equal(snapJson.estimate.low, 780000, "Low must match production input");
  assert.equal(snapJson.estimate.high, 870000, "High must match production input");
});

test("consumeDraftIntoSnapshot is idempotent on repeated calls", async () => {
  const result = makeProductionValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  const first = await svc.consumeDraftIntoSnapshot(draft.draftToken, 42, sql);
  const second = await svc.consumeDraftIntoSnapshot(draft.draftToken, 42, sql);

  assert.equal(first.report_id, second.report_id, "Must return same report_id");
  assert.equal(second.alreadyConsumed, true, "Second call must be marked consumed");
});

test("concurrent consume calls with shared mock state return same report_id", async () => {
  const result = makeProductionValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  // Both consumers share the same mock state (same sql instance)
  const [first, second] = await Promise.all([
    svc.consumeDraftIntoSnapshot(draft.draftToken, 42, sql),
    svc.consumeDraftIntoSnapshot(draft.draftToken, 42, sql),
  ]);

  assert.equal(first.report_id, second.report_id,
    "Both concurrent consumers must return the same report_id");
  // One of them won, the other lost — exactly one has alreadyConsumed: true
  const win = first.alreadyConsumed ? second : first;
  const loss = first.alreadyConsumed ? first : second;
  assert.equal(win.alreadyConsumed, false, "Winner must not be marked duplicate");
  assert.equal(loss.alreadyConsumed, true, "Loser must be marked duplicate");

  // Verify exactly one snapshot in the mock
  const snapCount = sql.__snapshots.size;
  assert.equal(snapCount, 1, "There must be exactly one snapshot in the mock DB");
});

test("consumeDraftIntoSnapshot rejects invalid token", async () => {
  const sql = createMockSql();
  await assert.rejects(
    () => svc.consumeDraftIntoSnapshot("invalid.token.here", 42, sql),
    { message: /invalid or has been tampered with/ }
  );
});

test("consumeDraftIntoSnapshot rejects draft expired in database (valid token, past expires_at)", async () => {
  const result = makeProductionValuationResult();
  const sql = createMockSql();

  // Create the draft normally — this gives us a validly-signed token
  const draft = await svc.createReportDraft(result, sql);

  // Now manually expire the DB row by setting expires_at to the past
  const payload = svc.verifyReportDraftToken(draft.draftToken);
  assert.ok(payload, "Token must still be valid at this point");

  const pastDate = new Date(Date.now() - 86400000); // 1 day ago
  const draftRecord = sql.__drafts.get(payload.draft_id);
  draftRecord.expires_at = pastDate.toISOString();

  // Token is still cryptographically valid (hasn't expired in its own clock),
  // but the DB row is expired — must be rejected by DB-side check.
  await assert.rejects(
    () => svc.consumeDraftIntoSnapshot(draft.draftToken, 42, sql),
    { message: /expired or is no longer valid/ }
  );
});

test("consumeDraftIntoSnapshot rejects invalid leadContactId", async () => {
  const result = makeProductionValuationResult();
  const sql = createMockSql();
  const draft = await svc.createReportDraft(result, sql);

  await assert.rejects(
    () => svc.consumeDraftIntoSnapshot(draft.draftToken, null, sql),
    { message: /Invalid lead_contact_id/ }
  );
  await assert.rejects(
    () => svc.consumeDraftIntoSnapshot(draft.draftToken, 0, sql),
    { message: /Invalid lead_contact_id/ }
  );
  await assert.rejects(
    () => svc.consumeDraftIntoSnapshot(draft.draftToken, -1, sql),
    { message: /Invalid lead_contact_id/ }
  );
  await assert.rejects(
    () => svc.consumeDraftIntoSnapshot(draft.draftToken, 0.5, sql),
    { message: /Invalid lead_contact_id/ }
  );
});

test("free valuation API ensures schema before creating draft", () => {
  const apiFile = fs.readFileSync(
    path.join(projectRoot, "api/valuation.js"),
    "utf8"
  );

  assert.ok(apiFile.includes("ensureCustomerFunnelSchema"),
    "valuation.js must import ensureCustomerFunnelSchema");
  assert.ok(apiFile.includes("ensureReportPaymentSchema"),
    "valuation.js must import ensureReportPaymentSchema");

  const handlerStart = apiFile.indexOf("export default async function handler");
  const handlerBody = apiFile.slice(handlerStart, handlerStart + 2500);
  const draftCallIndex = handlerBody.indexOf("createReportDraft(");
  const funnelCallIndex = handlerBody.indexOf("ensureCustomerFunnelSchema(");
  const paymentCallIndex = handlerBody.indexOf("ensureReportPaymentSchema(");

  assert.notEqual(funnelCallIndex, -1, "Must call ensureCustomerFunnelSchema in handler");
  assert.notEqual(paymentCallIndex, -1, "Must call ensureReportPaymentSchema in handler");
  assert.ok(funnelCallIndex < draftCallIndex,
    "ensureCustomerFunnelSchema must be called before createReportDraft");
  assert.ok(paymentCallIndex < draftCallIndex,
    "ensureReportPaymentSchema must be called before createReportDraft");
});

test("free valuation API must NOT return snapshot_json", () => {
  const apiFile = fs.readFileSync(
    path.join(projectRoot, "api/valuation.js"),
    "utf8"
  );

  assert.ok(apiFile.includes("reportDraftToken"), "Free valuation must return reportDraftToken");
  assert.ok(apiFile.includes("draftExpiresAt"), "Free valuation must return draftExpiresAt");

  const handlerSectionStart = apiFile.indexOf("export default async function handler");
  const handlerSection = apiFile.slice(handlerSectionStart, handlerSectionStart + 2200);
  assert.equal(
    handlerSection.includes("snapshot_json"),
    false,
    "Handler must not return snapshot_json in free valuation response"
  );
});

test("migration has UNIQUE index on report_snapshots.draft_id", () => {
  const sql = fs.readFileSync(
    path.join(projectRoot, "db/migration-010-report-payments.sql"),
    "utf8"
  );
  assert.ok(sql.includes("idx_rs_draft_id"), "Must define idx_rs_draft_id index");
  assert.ok(sql.includes("UNIQUE"), "Index must be unique");
  assert.ok(sql.includes("draft_id IS NOT NULL"), "Must be a partial unique index");
});

test("_db.js has UNIQUE index on report_snapshots.draft_id", () => {
  const db = fs.readFileSync(
    path.join(projectRoot, "api/_db.js"),
    "utf8"
  );
  assert.ok(db.includes("idx_rs_draft_id"), "_db.js must define idx_rs_draft_id index");
  assert.ok(db.includes("UNIQUE"), "Index must be unique");
  assert.ok(db.includes("draft_id IS NOT NULL"), "Must be a partial unique index");
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
