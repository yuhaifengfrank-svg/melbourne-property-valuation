// ── tests/stripe-report-webhook-integration-tests.mjs ──
// Phase 1D4: Webhook — Full Processing Integration Tests.
//
// Tests for POST /api/stripe-report-webhook with mock DB integration.
// Covers: completed checkout, idempotent redelivery, unsupported events,
// processing failures, ownership conflicts, signature failures, no real Stripe/DB.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

process.env.NODE_ENV = "test";

// ── Helpers (ported from stripe-report-webhook-signature-tests.mjs) ─

function computeStripeSignature(rawBodyOrString, secret, timestamp) {
  const body =
    typeof rawBodyOrString === "string"
      ? rawBodyOrString
      : rawBodyOrString.toString("utf8");
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const payload = `${ts}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { timestamp: ts, signature: sig, header: `t=${ts},v1=${sig}` };
}

function createMockStripe() {
  return {
    webhooks: {
      constructEvent(rawBody, sigHeader, secret) {
        if (!rawBody || rawBody.length === 0) {
          throw Object.assign(new Error("No payload"), {
            type: "StripeSignatureVerificationError",
          });
        }
        if (!secret) {
          throw Object.assign(new Error("No secret"), {
            type: "StripeSignatureVerificationError",
          });
        }
        const tMatch = sigHeader.match(/t=(\d+)/);
        const v1Match = sigHeader.match(/v1=([a-f0-9]+)/);
        if (!tMatch || !v1Match) {
          throw Object.assign(new Error("No signatures found"), {
            type: "StripeSignatureVerificationError",
          });
        }
        const bodyStr = rawBody.toString("utf8");
        const payload = `${tMatch[1]}.${bodyStr}`;
        const expected = crypto
          .createHmac("sha256", secret)
          .update(payload)
          .digest("hex");
        if (v1Match[1] !== expected) {
          throw Object.assign(new Error("Signature verification failed"), {
            type: "StripeSignatureVerificationError",
          });
        }
        return JSON.parse(bodyStr);
      },
    },
  };
}

function makeStreamReq(body, headers = {}, method = "POST") {
  const rawBody = body instanceof Buffer ? body : Buffer.from(String(body), "utf8");
  const req = Readable.from(rawBody);
  req.method = method;
  req.headers = { "content-type": "application/json", ...headers };
  return req;
}

function makeRes() {
  let statusCode = 200;
  let responseData = null;
  const res = {
    getStatus: () => statusCode,
    getData: () => responseData?.data,
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = { statusCode, data };
      return res;
    },
    setHeader: () => res,
    end: () => {},
  };
  return res;
}

// ── Test webhook secret ─────────────────────────────────────────────

const TEST_WEBHOOK_SECRET = "***" + crypto.randomBytes(16).toString("hex");

// ── In-memory mock DB ───────────────────────────────────────────────

const mockDb = {
  payments: [],
  entitlements: [],
  snapshots: [],
  webhookEvents: [],
};
let paymentIdSeq = 100;
let entitlementIdSeq = 100;

function resetMockDb() {
  mockDb.payments.length = 0;
  mockDb.entitlements.length = 0;
  mockDb.snapshots.length = 0;
  mockDb.webhookEvents.length = 0;
  paymentIdSeq = 100;
  entitlementIdSeq = 100;
}

function makeMockSql() {
  return async function sql(strings, ...values) {
    const raw = strings.map((s, i) => (i < values.length ? s + `$${i}` : s)).join("");

    // Schema statements — no-op
    if (raw.includes("CREATE TABLE") || raw.includes("ALTER TABLE") || raw.includes("CREATE INDEX")) {
      return [];
    }

    // ── Webhook events ──────────────────────────────────────────

    // INSERT INTO stripe_webhook_events ... DO NOTHING
    if (raw.includes("INSERT INTO stripe_webhook_events") && raw.includes("DO NOTHING")) {
      const eventId = values[0];
      const existing = mockDb.webhookEvents.find(e => e.stripe_event_id === eventId);
      if (existing) return [];
      mockDb.webhookEvents.push({
        stripe_event_id: eventId,
        event_type: values[1],
        processing_status: "received",
      });
      return [{ stripe_event_id: eventId, processing_status: "received" }];
    }

    // SELECT ... FROM stripe_webhook_events WHERE
    if (raw.includes("FROM stripe_webhook_events") && !raw.includes("UPDATE")) {
      const eventId = values[0];
      const match = mockDb.webhookEvents.find(e => e.stripe_event_id === eventId);
      if (match) return [{ processing_status: match.processing_status }];
      return [];
    }

    // UPDATE stripe_webhook_events SET processing_status
    if (raw.includes("UPDATE stripe_webhook_events") && raw.includes("processing_status")) {
      const eventId = values[values.length - 1];
      const match = mockDb.webhookEvents.find(e => e.stripe_event_id === eventId);
      if (match) {
        if (raw.includes("'processed'")) match.processing_status = "processed";
        else if (raw.includes("'failed'")) match.processing_status = "failed";
      }
      return match ? [{ stripe_event_id: eventId }] : [];
    }

    // ── Report payments ─────────────────────────────────────────

    // SELECT ... FROM report_payments WHERE stripe_payment_intent_id = $0 LIMIT 1
    const selPayPI = raw.match(
      /SELECT\s+(.+?)\s+FROM\s+report_payments\s+WHERE\s+stripe_payment_intent_id\s*=\s*\$(\d+)/i
    );
    if (selPayPI) {
      const idx = parseInt(selPayPI[2], 10);
      const pi = idx < values.length ? values[idx] : null;
      const p = mockDb.payments.find(p => p.stripe_payment_intent_id === pi);
      const selects = selPayPI[1].trim() === "*" ? "*" : selPayPI[1].split(",").map(s => s.trim());
      if (p) {
        const row = selects === "*" ? { ...p } : selects.reduce((o, c) => ({ ...o, [c]: p[c] }), {});
        return [row];
      }
      return [];
    }

    // SELECT ... FROM report_payments WHERE id = $0
    const selPayId = raw.match(/SELECT\s+(.+?)\s+FROM\s+report_payments\s+WHERE\s+id\s*=\s*\$(\d+)/i);
    if (selPayId) {
      const idx = parseInt(selPayId[2], 10);
      const pid = idx < values.length ? values[idx] : null;
      const p = mockDb.payments.find(p => p.id === pid);
      const selects = selPayId[1].trim() === "*" ? "*" : selPayId[1].split(",").map(s => s.trim());
      if (p) {
        const row = selects === "*" ? { ...p } : selects.reduce((o, c) => ({ ...o, [c]: p[c] }), {});
        return [row];
      }
      return [];
    }

    // SELECT ... FROM report_payments WHERE purchase_intent_key = $0 ...
    const selPayPik = raw.match(/SELECT\s+(.+?)\s+FROM\s+report_payments\s+WHERE\s+(.+?)(?:\s+LIMIT\s+\d+)?\s*$/is);
    if (selPayPik) {
      const selects = selPayPik[1].trim() === "*" ? "*" : selPayPik[1].split(",").map(s => s.trim());
      let resolved = selPayPik[2];
      for (let i = 0; i < values.length; i++) {
        resolved = resolved.replace(`$${i}`, values[i] !== null ? `'${values[i]}'` : "NULL");
      }
      const p = mockDb.payments.find(p => {
        const pikMatch = resolved.includes(`purchase_intent_key = '${p.purchase_intent_key}'`);
        const repMatch = resolved.includes(`report_id = '${p.report_id}'`);
        const sesMatch = resolved.includes(`stripe_checkout_session_id = '${p.stripe_checkout_session_id}'`);
        return pikMatch && repMatch && sesMatch;
      });
      if (p) {
        const row = selects === "*" ? { ...p } : selects.reduce((o, c) => ({ ...o, [c]: p[c] }), {});
        return [row];
      }
      return [];
    }

    // ── Entitlements ────────────────────────────────────────────

    // SELECT ... FROM report_entitlements WHERE report_id = $0
    const selEnt = raw.match(/SELECT\s+(.+?)\s+FROM\s+report_entitlements\s+WHERE\s+(.+?)(?:\s+LIMIT\s+\d+)?\s*$/is);
    if (selEnt) {
      const selects = selEnt[1].trim() === "*" ? "*" : selEnt[1].split(",").map(s => s.trim());
      let resolved = selEnt[2];
      for (let i = 0; i < values.length; i++) {
        resolved = resolved.replace(`$${i}`, values[i] !== null ? `'${values[i]}'` : "NULL");
      }
      const e = mockDb.entitlements.find(e => resolved.includes(`report_id = '${e.report_id}'`));
      if (e) {
        const row = selects === "*" ? { ...e } : selects.reduce((o, c) => ({ ...o, [c]: e[c] }), {});
        return [row];
      }
      return [];
    }

    // ── LEFT JOIN recheck (catch path, refund service) ─────────
    // Handle: SELECT rp.status, re.status AS ent_status, re.lead_contact_id AS ent_lead_contact_id
    //         FROM report_payments rp LEFT JOIN report_entitlements re ON ...
    //         WHERE rp.id = X LIMIT 1
    if (raw.includes("LEFT JOIN report_entitlements") && raw.includes("WHERE rp.id")) {
      const idMatch = raw.match(/WHERE\s+rp\.id\s*=\s*\$(\d+)/i);
      if (idMatch) {
        const idx = parseInt(idMatch[1], 10);
        const pid = idx < values.length ? values[idx] : null;
        const p = mockDb.payments.find(p => p.id === pid);
        if (p) {
          const e = mockDb.entitlements.find(e => e.report_id === p.report_id);
          return [{
            payment_status: p.status,
            ent_status: e ? e.status : null,
            ent_lead_contact_id: e ? e.lead_contact_id : null,
          }];
        }
      }
      return [];
    }

    // ── CTE: atomic entitlement upsert + payment update ─────────
    if (raw.trimStart().startsWith("WITH") && raw.includes("ent AS (") && raw.includes("pay AS (")) {
      return mockCteHandler(raw, values);
    }

    // INSERT INTO report_entitlements ... ON CONFLICT DO UPDATE
    if (raw.includes("INSERT INTO report_entitlements") && raw.includes("ON CONFLICT") && raw.includes("DO UPDATE")) {
      const insMatch = raw.match(/INSERT\s+INTO\s+report_entitlements\s+\((.+?)\)\s+VALUES\s+\((.+?)\)/is);
      if (insMatch) {
        const cols = insMatch[1].split(",").map(s => s.trim().toLowerCase());
        const vals = cols.map((_, i) => i < values.length ? values[i] : null);
        const row = {};
        cols.forEach((c, i) => { row[c] = vals[i]; });
        if (row.lead_contact_id !== undefined) {
          const n = Number(row.lead_contact_id);
          if (!isNaN(n)) row.lead_contact_id = n;
        }
        const existing = mockDb.entitlements.find(e => e.report_id === row.report_id);
        if (existing) {
          const whereMatch = raw.match(/WHERE\s+report_entitlements\.(\w+)\s*=\s*\$(\d+)/i);
          if (whereMatch) {
            const col = whereMatch[1].toLowerCase();
            // In our mock, $N = values[N] (0-indexed). No -1 needed.
            const idx = parseInt(whereMatch[2], 10);
            const expected = (idx >= 0 && idx < values.length) ? String(values[idx]) : null;
            if (String(existing[col]) !== expected) return [];
          }
          existing.status = "active";
          existing.revoked_at = null;
          existing.granted_at = new Date();
          return [{ id: existing.id, lead_contact_id: existing.lead_contact_id, status: existing.status }];
        }
        entitlementIdSeq++;
        row.id = entitlementIdSeq;
        row.granted_at = new Date();
        mockDb.entitlements.push(row);
        return [{ id: row.id, lead_contact_id: row.lead_contact_id, status: row.status }];
      }
    }

    return [];
  };
}

// ── CTE handler ─────────────────────────────────────────────────────

function mockCteHandler(raw, values) {
  let entResult = null;
  let conflictBlocked = false;
  let payResult = null;

  // ── Refund CTE: UPDATE report_entitlements SET status='revoked' ... ─
  // Detected by UPDATE inside ent AS (...) rather than INSERT INTO.
  const refundCte = raw.includes("UPDATE report_entitlements") &&
    raw.includes("SET status = 'revoked'");

  if (refundCte) {
    // ── Snapshot pre-CTE state for rollback simulation ──────────
    // PostgreSQL's writable CTE is a single statement: if the guard
    // throws (division by zero), ALL CTE mutations are rolled back.
    // We snapshot entitlement and payment before any mutation so we
    // can restore on guard failure.
    const preSnapshot = {
      ent: {
        id: null,
        status: null,
        revoked_at: null,
      },
      pay: {
        id: null,
        status: null,
      },
    };

    // Extract report_id and lead_contact_id from WHERE clause
    const repMatch = raw.match(/report_id\s*=\s*\$(\d+)/i);
    const leadMatch = raw.match(/lead_contact_id\s*=\s*\$(\d+)/i);
    const repIdx = repMatch ? parseInt(repMatch[1], 10) : -1;
    const leadIdx = leadMatch ? parseInt(leadMatch[1], 10) : -1;
    const repId = (repIdx >= 0 && repIdx < values.length) ? values[repIdx] : null;
    const leadId = (leadIdx >= 0 && leadIdx < values.length) ? values[leadIdx] : null;

    if (repId !== null && leadId !== null) {
      const e = mockDb.entitlements.find(
        e => e.report_id === repId &&
             Number(e.lead_contact_id) === Number(leadId) &&
             e.status === "active"
      );
      if (e) {
        // Snapshot before mutation
        preSnapshot.ent = { id: e.id, status: e.status, revoked_at: e.revoked_at };
        e.status = "revoked";
        e.revoked_at = new Date();
        entResult = { id: e.id, status: "revoked", revoked_at: e.revoked_at, lead_contact_id: e.lead_contact_id };
      }
    }

    // Extract payment id from pay WHERE clause
    const pmtIdMatch = raw.match(/WHERE\s+id\s*=\s*\$(\d+)/i);
    if (pmtIdMatch) {
      const idx = parseInt(pmtIdMatch[1], 10);
      const pmtId = (idx >= 0 && idx < values.length) ? values[idx] : null;
      // pay only proceeds if ent succeeded
      if (pmtId !== null && entResult !== null) {
        const statusMatch = raw.match(/status\s*=\s*'paid'/i);
        if (statusMatch) {
          const p = mockDb.payments.find(p => p.id === pmtId && p.status === "paid");
          if (p) {
            // Snapshot before mutation
            preSnapshot.pay = { id: p.id, status: p.status };
            p.status = "refunded";
            p.updated_at = new Date();
            payResult = { id: p.id, status: "refunded" };
          }
        }
      }
    }

    // Simulate the real PostgreSQL guard: 1 / CASE WHEN pay.id IS NOT NULL THEN 1 ELSE 0 END
    // If pay failed but ent succeeded, the guard throws division_by_zero.
    // Before throwing, roll back the entitlement mutation to simulate
    // PostgreSQL's statement-level atomic rollback.
    if (entResult !== null && payResult === null) {
      // Restore entitlement snapshot (statement-level rollback)
      if (preSnapshot.ent.id !== null) {
        const e = mockDb.entitlements.find(ent => ent.id === preSnapshot.ent.id);
        if (e) {
          e.status = preSnapshot.ent.status;
          e.revoked_at = preSnapshot.ent.revoked_at;
        }
      }
      throw Object.assign(
        new Error("division by zero"),
        { code: "DIVISION_BY_ZERO", routine: "int4div" }
      );
    }

    // Build return row
    const resultRow = {};
    if (entResult) {
      resultRow.entitlement_id = entResult.id;
      resultRow.entitlement_status = entResult.status;
      resultRow.entitlement_revoked_at = entResult.revoked_at;
    } else {
      resultRow.entitlement_id = null;
      resultRow.entitlement_status = null;
      resultRow.entitlement_revoked_at = null;
    }
    if (payResult) {
      resultRow.payment_id = payResult.id;
      resultRow.payment_status = payResult.status;
    } else {
      resultRow.payment_id = null;
      resultRow.payment_status = null;
    }
    return [resultRow];
  }

  // ── Checkout CTE: INSERT INTO report_entitlements ... ────────────
  const insMatch = raw.match(/INSERT\s+INTO\s+report_entitlements\s+\((.+?)\)\s+VALUES\s+\((.+?)\)/is);
  if (insMatch) {
    const cols = insMatch[1].split(",").map(s => s.trim().toLowerCase());
    const valsStr = insMatch[2]; // e.g. "$0, $1, 'active'"
    // Parse each value: either a placeholder ($N) or a literal ('...', NOW(), etc.)
    const valParts = valsStr.split(",").map(s => s.trim());

    const resolveVal = (v) => {
      const m = v.match(/^\$(\d+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        let ret = (idx >= 0 && idx < values.length) ? values[idx] : null;
        if (ret !== null && ret !== undefined && typeof ret === "string" && ret.toUpperCase() === "NULL") ret = null;
        return ret;
      }
      // Literal value
      const lit = v.replace(/^'(.*)'$/, "$1");
      if (lit !== v) return lit; // was a quoted string
      return v;
    };

    const row = {};
    cols.forEach((c, i) => {
      const v = i < valParts.length ? resolveVal(valParts[i]) : null;
      row[c] = v;
    });
    if (row.lead_contact_id !== undefined) {
      const n = Number(row.lead_contact_id);
      if (!isNaN(n)) row.lead_contact_id = n;
    }

    const existing = mockDb.entitlements.find(e => e.report_id === row.report_id);
    const whereMatch = raw.match(/WHERE\s+report_entitlements\.(\w+)\s*=\s*(\S+)/i);

    if (existing) {
      if (whereMatch) {
        const col = whereMatch[1].toLowerCase();
        let valStr = whereMatch[2].trim();
        const valIdx = valStr.match(/^\$(\d+)$/);
        if (valIdx) {
          // In our mock, $N = values[N] (0-indexed). No -1 needed.
          const idx = parseInt(valIdx[1], 10);
          valStr = (idx >= 0 && idx < values.length) ? String(values[idx]) : valStr;
        }
        valStr = valStr.replace(/^'(.*)'$/, "$1");
        if (String(existing[col]) !== valStr) {
          conflictBlocked = true;
        }
      }
      if (!conflictBlocked) {
        existing.status = 'active';
        existing.revoked_at = null;
        existing.granted_at = new Date();
        entResult = { id: existing.id, lead_contact_id: existing.lead_contact_id, status: existing.status };
      }
    } else {
      entitlementIdSeq++;
      row.id = entitlementIdSeq;
      if (!row.granted_at) row.granted_at = new Date();
      if (!row.status) row.status = 'active';
      mockDb.entitlements.push(row);
      entResult = { id: row.id, lead_contact_id: row.lead_contact_id, status: row.status };
    }
  }

  const existsCheck = raw.match(/AND\s+EXISTS\s+\(SELECT\s+1\s+FROM\s+ent\)/i);
  if (entResult && !conflictBlocked && existsCheck) {
    const pmtWhere = raw.match(/WHERE\s+id\s*=\s*\$(\d+)/i);
    if (pmtWhere) {
      // In our mock, $N = values[N] (0-indexed). No -1 needed.
      const idx = parseInt(pmtWhere[1], 10);
      const pmtId = (idx >= 0 && idx < values.length) ? values[idx] : null;
      const matched = mockDb.payments.filter(p => p.id === pmtId && ["pending", "failed"].includes(p.status));
      for (const p of matched) {
        p.status = "paid";
        p.updated_at = new Date();
        const piMatch = raw.match(/stripe_payment_intent_id\s*=\s*\$(\d+)/i);
        if (piMatch) {
          // In our mock, $N = values[N] (0-indexed). No -1 needed.
          const piIdx = parseInt(piMatch[1], 10);
          p.stripe_payment_intent_id = (piIdx >= 0 && piIdx < values.length) ? values[piIdx] : null;
        }
      }
      if (matched.length > 0) payResult = { id: matched[0].id, status: matched[0].status };
    }
  }

  const resultRow = {};
  if (conflictBlocked) {
    resultRow.entitlement_id = null;
    resultRow.entitlement_owner_id = null;
    resultRow.entitlement_status = null;
    resultRow.payment_id = null;
    resultRow.payment_status = null;
  } else {
    if (entResult) {
      resultRow.entitlement_id = entResult.id;
      resultRow.entitlement_owner_id = entResult.lead_contact_id;
      resultRow.entitlement_status = entResult.status;
    }
    if (payResult) {
      resultRow.payment_id = payResult.id;
      resultRow.payment_status = payResult.status;
    }
  }
  return [resultRow];
}

// ── Helpers ─────────────────────────────────────────────────────────

function makeSessionObject(overrides = {}) {
  return {
    id: overrides.sessionId || "cs_test_int_" + crypto.randomBytes(12).toString("hex"),
    mode: "payment",
    payment_status: "paid",
    payment_intent: overrides.paymentIntent || "pi_test_int_" + crypto.randomBytes(12).toString("hex"),
    metadata: {
      product_code: "valuation_report_399",
      report_id: overrides.reportId || "rpt_int_" + crypto.randomBytes(8).toString("hex"),
      purchase_intent_key: overrides.pik || "pik_int_" + crypto.randomBytes(8).toString("hex"),
    },
  };
}

function buildCompletedEventPayload(session) {
  return JSON.stringify({
    id: "evt_test_int_" + crypto.randomBytes(8).toString("hex"),
    type: "checkout.session.completed",
    data: { object: session },
  });
}

function buildUnsupportedEvent() {
  return JSON.stringify({
    id: "evt_test_int_" + crypto.randomBytes(8).toString("hex"),
    type: "charge.succeeded",
    data: { object: { id: "ch_test_int_" + crypto.randomBytes(6).toString("hex") } },
  });
}

function makeChargeObject(overrides = {}) {
  return {
    id: overrides.id || "ch_test_int_" + crypto.randomBytes(8).toString("hex"),
    payment_intent: overrides.paymentIntent || "pi_test_int_" + crypto.randomBytes(12).toString("hex"),
    amount_refunded: overrides.amountRefunded !== undefined ? overrides.amountRefunded : 1000,
    amount: overrides.amount !== undefined ? overrides.amount : 1000,
    currency: overrides.currency || "aud",
  };
}

function buildRefundedEventPayload(charge) {
  return JSON.stringify({
    id: "evt_test_int_" + crypto.randomBytes(8).toString("hex"),
    type: "charge.refunded",
    data: { object: charge },
  });
}

// ── Setup ───────────────────────────────────────────────────────────

async function setupEnv(options = {}) {
  resetMockDb();
  const mockSql = makeMockSql();

  if (options.seedPayment) {
    paymentIdSeq++;
    const p = {
      id: options.seedPayment.id || paymentIdSeq,
      report_id: options.seedPayment.report_id,
      lead_contact_id: options.seedPayment.lead_contact_id || 42,
      stripe_customer_id: "cus_test_int",
      stripe_checkout_session_id: options.seedPayment.stripe_checkout_session_id,
      stripe_payment_intent_id: options.seedPayment.stripe_payment_intent_id || null,
      purchase_intent_key: options.seedPayment.purchase_intent_key,
      amount_cents: options.seedPayment.amount_cents !== undefined ? options.seedPayment.amount_cents : 399,
      currency: options.seedPayment.currency || "aud",
      status: options.seedPayment.status || "pending",
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockDb.payments.push(p);
  }

  if (options.seedEntitlement) {
    entitlementIdSeq++;
    const e = {
      id: options.seedEntitlement.id || entitlementIdSeq,
      report_id: options.seedEntitlement.report_id,
      lead_contact_id: options.seedEntitlement.lead_contact_id,
      status: options.seedEntitlement.status || "active",
      granted_at: new Date(),
      revoked_at: options.seedEntitlement.revoked_at || null,
    };
    mockDb.entitlements.push(e);
  }

  process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

  const { setMockStripe } = await import("../lib/stripe-client.js");
  setMockStripe(createMockStripe());

  const ts = Date.now();
  const whMod = await import(`../api/stripe-report-webhook.js?t=${ts}`);
  whMod.setTestSql(mockSql);

  return {
    handler: whMod.default,
    mockSql,
    mockDb,
    events: mockDb.webhookEvents,
    payments: mockDb.payments,
    entitlements: mockDb.entitlements,
  };
}

// ══════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════

test("normal checkout completed creates paid payment and active entitlement", async () => {
  const reportId = "rpt_int_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_int_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_int_" + crypto.randomBytes(12).toString("hex");

  const session = makeSessionObject({ sessionId, reportId, pik });
  const payload = buildCompletedEventPayload(session);
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv({
    seedPayment: {
      report_id: reportId,
      purchase_intent_key: pik,
      stripe_checkout_session_id: sessionId,
    },
  });

  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();
  await env.handler(req, res);

  assert.equal(res.getStatus(), 200, "Should return 200");
  assert.equal(env.events.length, 1, "Should create webhook event record");
  assert.equal(env.events[0].processing_status, "processed", "Should be marked processed");
  assert.equal(env.payments[0].status, "paid", "Payment should be paid");
  assert.equal(env.entitlements.length, 1, "Should create entitlement");
  assert.equal(env.entitlements[0].status, "active", "Entitlement should be active");
  assert.equal(Number(env.entitlements[0].lead_contact_id), 42,
    "Entitlement lead_contact_id should come from payment");
});

test("redelivered already-processed event returns 200 idempotent", async () => {
  const reportId = "rpt_int_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_int_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_int_" + crypto.randomBytes(12).toString("hex");

  const session = makeSessionObject({ sessionId, reportId, pik });
  const payload = buildCompletedEventPayload(session);
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv({
    seedPayment: {
      report_id: reportId,
      purchase_intent_key: pik,
      stripe_checkout_session_id: sessionId,
    },
  });

  // First delivery
  const req1 = makeStreamReq(payload, { "stripe-signature": header });
  await env.handler(req1, makeRes());

  // Redelivery
  const req2 = makeStreamReq(payload, { "stripe-signature": header });
  const res2 = makeRes();
  await env.handler(req2, res2);

  assert.equal(res2.getStatus(), 200, "Redelivery should return 200");
  const data2 = res2.getData();
  assert.equal(data2.idempotent, true, "Should be flagged idempotent");
  assert.equal(env.events.length, 1, "No duplicate webhook event row");
  assert.equal(env.payments[0].status, "paid", "Payment unchanged");
  assert.equal(env.entitlements.length, 1, "Only one entitlement");
});

test("unsupported event is safely ignored", async () => {
  const payload = buildUnsupportedEvent();
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv();

  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();
  await env.handler(req, res);

  assert.equal(res.getStatus(), 200, "Should return 200");
  const data = res.getData();
  assert.equal(data.ignored, true, "Should be flagged as ignored");
  assert.equal(data.eventType, "charge.succeeded", "Should return event type");
  assert.equal(env.events.length, 1, "Should create webhook event record");
  assert.equal(env.events[0].processing_status, "processed",
    "Ignored event should still be marked processed for idempotency");
  assert.equal(env.payments.length, 0, "No payments created for ignored event");
  assert.equal(env.entitlements.length, 0, "No entitlements for ignored event");
});

test("checkout completed with missing DB payment marks failed and returns 500", async () => {
  const payload = buildCompletedEventPayload(makeSessionObject());
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv(); // no seed payment

  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();
  await env.handler(req, res);

  assert.equal(res.getStatus(), 500, "Should return 500 on processing failure");
  assert.equal(env.events.length, 1, "Should create webhook event");
  assert.equal(env.events[0].processing_status, "failed", "Failed event marked as failed");
  assert.equal(env.payments.length, 0, "No payments created");
  assert.equal(env.entitlements.length, 0, "No entitlements created");

  // Must not leak internals
  const body = JSON.stringify(res.getData());
  assert.equal(body.includes("lead_contact_id"), false, "Must not expose lead_contact_id");
  assert.equal(body.includes("report_payments"), false, "Must not expose DB details");
  assert.equal(body.includes("stripe"), false, "Must not expose Stripe details");
});

test("cross-customer ownership conflict marks failed and does not change payment or entitlement", async () => {
  const reportId = "rpt_int_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_int_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_int_" + crypto.randomBytes(12).toString("hex");

  const session = makeSessionObject({ sessionId, reportId, pik });
  const payload = buildCompletedEventPayload(session);
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv({
    seedPayment: {
      report_id: reportId,
      purchase_intent_key: pik,
      stripe_checkout_session_id: sessionId,
      lead_contact_id: 99, // Customer B owns the payment
    },
    seedEntitlement: {
      report_id: reportId,
      lead_contact_id: 42, // Customer A owns the report
    },
  });

  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();
  await env.handler(req, res);

  assert.equal(res.getStatus(), 500, "Ownership conflict should return 500");
  assert.equal(env.events.length, 1, "Should create webhook event");
  assert.equal(env.events[0].processing_status, "failed", "Should be marked failed");

  // Payment must NOT have been changed
  assert.equal(env.payments[0].status, "pending", "Payment must not be changed on conflict");

  // Entitlement must NOT have been modified
  assert.equal(env.entitlements.length, 1, "Only one entitlement");
  assert.equal(Number(env.entitlements[0].lead_contact_id), 42, "Entitlement owner unchanged");
  assert.equal(env.entitlements[0].status, "active", "Entitlement status unchanged");

  // Response must not expose internals
  const body = JSON.stringify(res.getData());
  assert.equal(body.includes("lead_contact_id"), false, "Must not expose lead_contact_id");
  assert.equal(body.includes("42"), false, "Must not expose customer ID");
  assert.equal(body.includes("report_payments"), false, "Must not expose DB details");
  assert.equal(body.includes("stripe"), false, "Must not expose Stripe details");
});

test("signature failure returns 400 and writes nothing to database", async () => {
  const payload = buildUnsupportedEvent();
  const wrongSecret = ("wh" + "sec_wrong_") + crypto.randomBytes(8).toString("hex");
  const { header } = computeStripeSignature(payload, wrongSecret);

  const env = await setupEnv();

  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();
  await env.handler(req, res);

  assert.equal(res.getStatus(), 400, "Signature failure should return 400");
  assert.equal(env.events.length, 0, "No webhook event created");
  assert.equal(env.payments.length, 0, "No payments created");
  assert.equal(env.entitlements.length, 0, "No entitlements created");

  const data = res.getData();
  assert.equal(data.error, "SIGNATURE_INVALID", "Error code must be SIGNATURE_INVALID");
  assert.equal(data.message, "Invalid webhook signature.", "Safe error message");
});

test("no real Stripe or production DB access", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "api/stripe-report-webhook.js"),
    "utf8"
  );
  assert.equal(source.includes('from "stripe"'), false, "Must not import stripe SDK directly");
  assert.equal(source.includes("STRIPE_SECRET_KEY"), false, "Must not read SECRET_KEY directly");
  assert.equal(source.includes("DATABASE_URL"), false, "Must not hardcode DATABASE_URL");
  assert.equal(source.includes("new Stripe("), false, "Must not instantiate Stripe directly");
});
test("Promise.all same event_id: only one caller processes, other gets 409", async () => {
  const reportId = "rpt_int_con_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_int_con_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_int_con_" + crypto.randomBytes(12).toString("hex");
  const paymentIntent = "pi_test_int_con_" + crypto.randomBytes(12).toString("hex");

  const session = makeSessionObject({ sessionId, reportId, pik, paymentIntent });
  const eventId = "evt_test_int_con_" + crypto.randomBytes(8).toString("hex");
  const payload = JSON.stringify({
    id: eventId,
    type: "checkout.session.completed",
    data: { object: session },
  });
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv({
    seedPayment: {
      report_id: reportId,
      purchase_intent_key: pik,
      stripe_checkout_session_id: sessionId,
    },
  });

  // Confirm start state
  assert.equal(env.events.length, 0, "No events before test");
  assert.equal(env.payments.length, 1, "One seeded payment");
  assert.equal(env.payments[0].status, "pending", "Payment is pending");
  assert.equal(env.entitlements.length, 0, "No entitlements yet");

  // Fire both requests concurrently
  const req1 = makeStreamReq(payload, { "stripe-signature": header });
  const res1 = makeRes();
  const req2 = makeStreamReq(payload, { "stripe-signature": header });
  const res2 = makeRes();

  const [r1, r2] = await Promise.all([
    env.handler(req1, res1),
    env.handler(req2, res2),
  ]);

  // Exactly one handler should have succeeded (200)
  const s200 = [res1, res2].filter(r => r.getStatus() === 200);
  const s409 = [res1, res2].filter(r => r.getStatus() === 409);
  assert.equal(s200.length, 1, "Exactly one request returns 200");
  assert.equal(s409.length, 1, "Exactly one request returns 409");

  // Only one entitlement created
  assert.equal(env.entitlements.length, 1, "Exactly one entitlement created");

  // Exactly one payment update
  const paidPayments = env.payments.filter(p => p.status === "paid");
  assert.equal(paidPayments.length, 1, "Exactly one payment marked paid");

  // Exactly one webhook event, final status is processed
  assert.equal(env.events.length, 1, "Exactly one webhook event row");
  assert.equal(env.events[0].processing_status, "processed",
    "Final event status is 'processed'");

  // The 200 response must not have been marked as ignored
  const successRes = s200[0];
  const successData = successRes.getData();
  assert.equal(successData.ignored, false,
    "200 handler must not be flagged as ignored");

  // The 409 response must not have called handleCheckoutCompleted
  // (no side effects from the 409 caller)
  const failRes = s409[0];
  const failData = failRes.getData();
  assert.equal(failData.error, "DUPLICATE_PROCESSING",
    "409 must return DUPLICATE_PROCESSING");
  assert.equal(failData.message, "This event is already being processed.",
    "Safe error message");
});

// ══════════════════════════════════════════════════════════════════════
// Phase 1D5B: charge.refunded — Full Integration
// ══════════════════════════════════════════════════════════════════════

test("normal refund revokes entitlement atomically via webhook", async () => {
  const reportId = "rpt_int_ref_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_int_ref_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_int_ref_" + crypto.randomBytes(12).toString("hex");
  const paymentIntent = "pi_test_int_ref_" + crypto.randomBytes(12).toString("hex");

  const charge = makeChargeObject({ paymentIntent });
  const payload = buildRefundedEventPayload(charge);
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv({
    seedPayment: {
      report_id: reportId,
      purchase_intent_key: pik,
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntent,
      lead_contact_id: 42,
      status: "paid",
    },
    seedEntitlement: {
      report_id: reportId,
      lead_contact_id: 42,
      status: "active",
    },
  });

  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();
  await env.handler(req, res);

  assert.equal(res.getStatus(), 200, "Should return 200");
  const data = res.getData();
  assert.equal(data.eventType, "charge.refunded", "Should report charge.refunded");
  assert.equal(data.ignored, false, "charge.refunded must NOT be ignored");

  // Verify event tracking
  assert.equal(env.events.length, 1, "Should create webhook event record");
  assert.equal(env.events[0].processing_status, "processed", "Should be marked processed");

  // Verify DB state
  assert.equal(env.payments[0].status, "refunded", "Payment should be refunded");
  assert.equal(env.entitlements.length, 1, "Entitlement row unchanged");
  assert.equal(env.entitlements[0].status, "revoked", "Entitlement should be revoked");
  assert.ok(env.entitlements[0].revoked_at !== null, "revoked_at should be set");
});

test("charge.refunded redelivery is idempotent", async () => {
  const reportId = "rpt_int_ref2_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_int_ref2_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_int_ref2_" + crypto.randomBytes(12).toString("hex");
  const paymentIntent = "pi_test_int_ref2_" + crypto.randomBytes(12).toString("hex");

  const charge = makeChargeObject({ paymentIntent });
  const payload = buildRefundedEventPayload(charge);
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv({
    seedPayment: {
      report_id: reportId,
      purchase_intent_key: pik,
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntent,
      lead_contact_id: 42,
      status: "paid",
    },
    seedEntitlement: {
      report_id: reportId,
      lead_contact_id: 42,
      status: "active",
    },
  });

  // First delivery
  const req1 = makeStreamReq(payload, { "stripe-signature": header });
  await env.handler(req1, makeRes());

  // Redelivery
  const req2 = makeStreamReq(payload, { "stripe-signature": header });
  const res2 = makeRes();
  await env.handler(req2, res2);

  assert.equal(res2.getStatus(), 200, "Redelivery should return 200");
  const data2 = res2.getData();
  assert.equal(data2.idempotent, true, "Should be flagged idempotent");
  assert.equal(env.events.length, 1, "No duplicate webhook event row");
  assert.equal(env.payments[0].status, "refunded", "Payment unchanged");
  assert.equal(env.entitlements[0].status, "revoked", "Entitlement unchanged");
});

test("charge.refunded with unknown payment_intent returns 500", async () => {
  const charge = makeChargeObject({ paymentIntent: "pi_unknown_refund" });
  const payload = buildRefundedEventPayload(charge);
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv(); // no seed data

  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();
  await env.handler(req, res);

  assert.equal(res.getStatus(), 500, "Missing payment should return 500");
  assert.equal(env.events.length, 1, "Should create webhook event");
  assert.equal(env.events[0].processing_status, "failed", "Should be marked failed");

  // Must not leak internals
  const body = JSON.stringify(res.getData());
  assert.equal(body.includes("payment_intent"), false, "Must not expose payment_intent");
  assert.equal(body.includes("report_payments"), false, "Must not expose DB details");
});

test("charge.refunded with amount_refunded=0 rejects", async () => {
  const paymentIntent = "pi_test_int_ref0_" + crypto.randomBytes(12).toString("hex");
  const reportId = "rpt_int_ref0_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_int_ref0_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_int_ref0_" + crypto.randomBytes(12).toString("hex");

  const charge = makeChargeObject({ paymentIntent, amountRefunded: 0 });
  const payload = buildRefundedEventPayload(charge);
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv({
    seedPayment: {
      report_id: reportId,
      purchase_intent_key: pik,
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntent,
      lead_contact_id: 42,
      status: "paid",
    },
    seedEntitlement: {
      report_id: reportId,
      lead_contact_id: 42,
      status: "active",
    },
  });

  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();
  await env.handler(req, res);

  assert.equal(res.getStatus(), 500, "Zero amount refunded should return 500");
  assert.equal(env.payments[0].status, "paid", "Payment must stay paid");
  assert.equal(env.entitlements[0].status, "active", "Entitlement must stay active");
});

test("charge.refunded cross-owner: payment stays paid, entitlement unchanged", async () => {
  const paymentIntent = "pi_test_int_cross_" + crypto.randomBytes(12).toString("hex");
  const reportId = "rpt_int_cross_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_int_cross_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_int_cross_" + crypto.randomBytes(12).toString("hex");

  const charge = makeChargeObject({ paymentIntent });
  const payload = buildRefundedEventPayload(charge);
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv({
    seedPayment: {
      report_id: reportId,
      purchase_intent_key: pik,
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntent,
      lead_contact_id: 42,
      status: "paid",
    },
    // Entitlement belongs to a different customer
    seedEntitlement: {
      report_id: reportId,
      lead_contact_id: 99,
      status: "active",
    },
  });

  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();
  await env.handler(req, res);

  assert.equal(res.getStatus(), 500, "Cross-owner refund should return 500");
  assert.equal(env.events.length, 1, "Should create webhook event");
  assert.equal(env.events[0].processing_status, "failed", "Should be marked failed");

  // DB unchanged
  assert.equal(env.payments[0].status, "paid", "Payment must stay paid");
  assert.equal(env.entitlements[0].status, "active", "Entitlement must stay active");
  assert.equal(Number(env.entitlements[0].lead_contact_id), 99, "Entitlement owner unchanged");

  // Must not leak internals
  const body = JSON.stringify(res.getData());
  assert.equal(body.includes("lead_contact_id"), false, "Must not expose lead_contact_id");
  assert.equal(body.includes("99"), false, "Must not expose customer ID");
  assert.equal(body.includes("report_payments"), false, "Must not expose DB details");
});

test("charge.refunded on pending payment rejects (never paid)", async () => {
  const paymentIntent = "pi_test_int_pend_" + crypto.randomBytes(12).toString("hex");
  const reportId = "rpt_int_pend_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_int_pend_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_int_pend_" + crypto.randomBytes(12).toString("hex");

  const charge = makeChargeObject({ paymentIntent });
  const payload = buildRefundedEventPayload(charge);
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv({
    seedPayment: {
      report_id: reportId,
      purchase_intent_key: pik,
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntent,
      lead_contact_id: 42,
      status: "pending",
    },
  });

  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();
  await env.handler(req, res);

  assert.equal(res.getStatus(), 500, "Refunding pending payment should return 500");
  assert.equal(env.payments[0].status, "pending", "Payment must stay pending");
});

test("charge.refunded event without payment_intent field returns 500", async () => {
  const charge = makeChargeObject({ paymentIntent: null });
  const payload = buildRefundedEventPayload(charge);
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv();

  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();
  await env.handler(req, res);

  assert.equal(res.getStatus(), 500, "Missing payment_intent should return 500");
  assert.equal(env.events.length, 1, "Should create webhook event");
  assert.equal(env.events[0].processing_status, "failed", "Should be marked failed");
});

test("charge.refunded: Promise.all concurrent — one succeeds, one gets 409 (event claim)", async () => {
  const paymentIntent = "pi_test_int_concR_" + crypto.randomBytes(12).toString("hex");
  const reportId = "rpt_int_concR_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_int_concR_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_int_concR_" + crypto.randomBytes(12).toString("hex");

  const charge = makeChargeObject({ paymentIntent });
  const eventId = "evt_test_int_concR_" + crypto.randomBytes(8).toString("hex");
  const payload = JSON.stringify({
    id: eventId,
    type: "charge.refunded",
    data: { object: charge },
  });
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);

  const env = await setupEnv({
    seedPayment: {
      report_id: reportId,
      purchase_intent_key: pik,
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntent,
      lead_contact_id: 42,
      status: "paid",
    },
    seedEntitlement: {
      report_id: reportId,
      lead_contact_id: 42,
      status: "active",
    },
  });

  // Confirm start state
  assert.equal(env.events.length, 0, "No events before test");
  assert.equal(env.payments[0].status, "paid", "Payment is paid");
  assert.equal(env.entitlements[0].status, "active", "Entitlement is active");

  // Fire both requests concurrently
  const req1 = makeStreamReq(payload, { "stripe-signature": header });
  const res1 = makeRes();
  const req2 = makeStreamReq(payload, { "stripe-signature": header });
  const res2 = makeRes();

  await Promise.all([
    env.handler(req1, res1),
    env.handler(req2, res2),
  ]);

  // Exactly one handler should have succeeded (200)
  const s200 = [res1, res2].filter(r => r.getStatus() === 200);
  const s409 = [res1, res2].filter(r => r.getStatus() === 409);
  assert.equal(s200.length, 1, "Exactly one request returns 200");
  assert.equal(s409.length, 1, "Exactly one request returns 409");

  // The charge.refunded event must NOT be flagged as ignored
  const successRes = s200[0];
  const successData = successRes.getData();
  assert.equal(successData.ignored, false,
    "200 handler must not be flagged as ignored");

  // Exactly one webhook event row, final status is processed
  assert.equal(env.events.length, 1, "Exactly one webhook event row");
  assert.equal(env.events[0].processing_status, "processed",
    "Final event status is 'processed'");

  // Exactly one payment update (refunded)
  const refundedPayments = env.payments.filter(p => p.status === "refunded");
  assert.equal(refundedPayments.length, 1, "Exactly one payment marked refunded");

  // Exactly one entitlement updated (revoked)
  const revokedEnts = env.entitlements.filter(e => e.status === "revoked");
  assert.equal(revokedEnts.length, 1, "Exactly one entitlement changed to revoked");

  // The 409 response must have the correct error
  const failRes = s409[0];
  const failData = failRes.getData();
  assert.equal(failData.error, "DUPLICATE_PROCESSING",
    "409 must return DUPLICATE_PROCESSING");
});

test("charge.refunded: Promise.all concurrent same payment but DIFFERENT events (CTE race guard)", async () => {
  // Two different charge.refunded events arrive concurrently,
  // both with the same payment_intent. The event-claim system
  // allows both (different event IDs), but the CTE's atomic
  // guard ensures only one actually refunds.
  const paymentIntent = "pi_test_int_cterace_" + crypto.randomBytes(12).toString("hex");
  const reportId = "rpt_int_cterace_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_int_cterace_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_int_cterace_" + crypto.randomBytes(12).toString("hex");

  const charge1 = makeChargeObject({ paymentIntent });
  const charge2 = makeChargeObject({ paymentIntent });
  const payload1 = JSON.stringify({
    id: "evt_test_cterace1_" + crypto.randomBytes(6).toString("hex"),
    type: "charge.refunded",
    data: { object: charge1 },
  });
  const payload2 = JSON.stringify({
    id: "evt_test_cterace2_" + crypto.randomBytes(6).toString("hex"),
    type: "charge.refunded",
    data: { object: charge2 },
  });
  const { header: header1 } = computeStripeSignature(payload1, TEST_WEBHOOK_SECRET);
  const { header: header2 } = computeStripeSignature(payload2, TEST_WEBHOOK_SECRET);

  const env = await setupEnv({
    seedPayment: {
      report_id: reportId,
      purchase_intent_key: pik,
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntent,
      lead_contact_id: 42,
      status: "paid",
    },
    seedEntitlement: {
      report_id: reportId,
      lead_contact_id: 42,
      status: "active",
    },
  });

  // Fire both requests concurrently
  const req1 = makeStreamReq(payload1, { "stripe-signature": header1 });
  const res1 = makeRes();
  const req2 = makeStreamReq(payload2, { "stripe-signature": header2 });
  const res2 = makeRes();

  await Promise.all([
    env.handler(req1, res1),
    env.handler(req2, res2),
  ]);

  // The CTE guard ensures exactly one refund succeeds:
  // - Runner A: CTE succeeds → entitlement revoked + payment refunded → 200
  // - Runner B: CTE runs with ent already revoked → the mock's refund CTE
  //   simulates the real PostgreSQL guard: pay fails but ent was mutated,
  //   so it restores ent to 'active' (statement-level rollback) before
  //   throwing division_by_zero. The service's catch-path recheck sees
  //   payment still 'paid' (no concurrent refund happened for B's window)
  //   → throws ATOMIC_UPDATE_FAILED → 500.
  const s200 = [res1, res2].filter(r => r.getStatus() === 200);
  const non200 = [res1, res2].filter(r => r.getStatus() !== 200);

  assert.equal(s200.length, 1, "Exactly one request returns 200 (refund processed)");
  assert.equal(non200.length, 1, "Exactly one non-200 response (CTE guard abort)");

  const successRes = s200[0];
  assert.equal(successRes.getData().ignored, false,
    "200 handler must not be flagged as ignored");

  // Exactly two webhook event rows
  assert.equal(env.events.length, 2, "Two webhook event rows");

  // Exactly one event processed (the other failed — CTE guard abort is NOT a retry-safe 200)
  const processed = env.events.filter(e => e.processing_status === "processed");
  const failed = env.events.filter(e => e.processing_status === "failed");
  assert.equal(processed.length, 1, "Exactly one event processed");
  assert.equal(failed.length, 1, "Exactly one event failed (CTE guard)");

  // Exactly one payment refunded
  const refundedPayments = env.payments.filter(p => p.status === "refunded");
  assert.equal(refundedPayments.length, 1, "Exactly one payment marked refunded");
  assert.equal(env.payments[0].status, "refunded",
    "The sole payment record is refunded");

  // Exactly one entitlement revoked
  const revokedEnts = env.entitlements.filter(e => e.status === "revoked");
  assert.equal(revokedEnts.length, 1, "Exactly one entitlement revoked");

  // ══ Root-cause verification: the failed CTE must NOT leave half-state ══
  // The payment record must still be 'refunded' (successful event won)
  // and NOT 'paid' (the failed attempt must not have corrupted the outcome).
  // The entitlement must still be 'revoked' — no rollback corruption from
  // the loser's aborted CTE.
  assert.equal(env.payments[0].status, "refunded",
    "Payment must NOT regress to paid after CTE guard abort");
  assert.equal(env.entitlements[0].status, "revoked",
    "Entitlement must NOT regress to active after CTE guard abort");
  assert.ok(env.entitlements[0].revoked_at !== null,
    "revoked_at must remain set — rollback must not corrupt winner's state");
});
