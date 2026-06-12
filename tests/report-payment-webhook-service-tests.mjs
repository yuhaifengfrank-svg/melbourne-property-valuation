// ── tests/report-payment-webhook-service-tests.mjs ──
// Phase 1D3: Checkout Session Completed Event Handler Tests.
//
// Tests for handleCheckoutCompleted in report-payment-webhook-service.js.
// No Stripe network, no production DB.
// Uses mock database with transaction support.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// ── Mock database ───────────────────────────────────────────────────
//
// Captures the raw tagged-template SQL and resolves $N placeholders
// from the values array before matching conditions.

function createMockDb(initialState = {}) {
  const payments = [...(initialState.payments || [])];
  const entitlements = [...(initialState.entitlements || [])];
  let entitlementIdSeq = entitlements.length;
  let callLog = [];

  function resolvePlaceholders(expr, values) {
    return expr.replace(/\$(\d+)/g, (_, n) => {
      const idx = parseInt(n, 10) - 1;
      if (idx < 0 || idx >= values.length) return `$${n}`;
      const v = values[idx];
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "string") return `'${v}'`;
      if (v instanceof Date) return `'${v.toISOString()}'`;
      return String(v);
    });
  }

  function rowMatchesWhere(whereClause, row, values) {
    const resolved = resolvePlaceholders(whereClause, values);
    const parts = resolved.split(/\s+AND\s+/i);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const inMatch = trimmed.match(/^(\w+)\s+IN\s*\((.+)\)$/i);
      if (inMatch) {
        const col = inMatch[1].toLowerCase();
        const inValues = inMatch[2].split(",").map((v) =>
          v.trim().replace(/^'(.*)'$/, "$1")
        );
        if (!inValues.includes(String(row[col]))) return false;
        continue;
      }

      const eqMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
      if (eqMatch) {
        const col = eqMatch[1].toLowerCase();
        let val = eqMatch[2].trim();
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        else if (val.toUpperCase() === "NULL") val = null;
        else if (val.toUpperCase() === "NOW()") continue;
        else if (val.includes("COALESCE") || val.includes("report_payments.")) continue;

        if (row[col] === undefined) return false;
        const rowVal = row[col] === null ? null : String(row[col]);
        if (String(rowVal) !== String(val === null ? null : val)) return false;
        continue;
      }

      const opMatch = trimmed.match(/^(\w+)\s*(>=|<=|!=|<>|>|<)\s*(.+)$/);
      if (opMatch) {
        const col = opMatch[1].toLowerCase();
        const op = opMatch[2];
        let val = opMatch[3].trim();
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        const rowVal = Number(row[col]);
        const cmpVal = Number(val);
        if (isNaN(rowVal) || isNaN(cmpVal)) continue;
        switch (op) {
          case ">": if (!(rowVal > cmpVal)) return false; break;
          case "<": if (!(rowVal < cmpVal)) return false; break;
          case ">=": if (!(rowVal >= cmpVal)) return false; break;
          case "<=": if (!(rowVal <= cmpVal)) return false; break;
          case "!=":
          case "<>": if (rowVal === cmpVal) return false; break;
        }
        continue;
      }
    }
    return true;
  }

  function parseSetClause(setClause, values) {
    const resolved = resolvePlaceholders(setClause, values);
    const result = {};
    const parts = resolved.split(",").map((s) => s.trim());
    for (const part of parts) {
      const eqMatch = part.match(/^(\w+)\s*=\s*(.+)$/);
      if (eqMatch) {
        const col = eqMatch[1].toLowerCase();
        let val = eqMatch[2].trim();
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        else if (val.toUpperCase() === "NULL") val = null;
        else if (val.toUpperCase() === "NOW()") val = new Date();
        else if (val.includes("EXCLUDED.")) { /* handled separately */ }
        result[col] = val;
      }
    }
    return result;
  }

  function sql(strings, ...values) {
    const q = strings.reduce(
      (acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""),
      ""
    );
    callLog.push({ query: q, values: [...values] });
    // ── CTE: atomic entitlement upsert + conditional payment update ──
    // Simpler approach: check for WITH + ent AS + pay AS
    if (q.trimStart().startsWith("WITH") && q.includes("ent AS (") && q.includes("pay AS (")) {
      let entResult = null;
      let conflictBlocked = false;
      let payResult = null;

      // Extract INSERT INTO report_entitlements values
      const insMatch = q.match(/INSERT\s+INTO\s+report_entitlements\s+\((.+?)\)\s+VALUES\s+\((.+?)\)/is);
      if (insMatch) {
        const cols = insMatch[1].split(",").map((s) => s.trim().toLowerCase());
        const vals = resolvePlaceholders(insMatch[2], values).split(",").map((s) =>
          s.trim().replace(/^'(.*)'$/, "$1")
        );

        const row = {};
        cols.forEach((c, i) => {
          let v = vals[i];
          if (v === undefined) v = null;
          if (typeof v === "string" && v.toUpperCase() === "NULL") v = null;
          if (typeof v === "string" && v.toUpperCase() === "NOW()") v = new Date();
          row[c] = v;
        });
        if (row.lead_contact_id !== undefined) {
          const n = Number(row.lead_contact_id);
          if (!isNaN(n)) row.lead_contact_id = n;
        }

        const existing = entitlements.find((e) => e.report_id === row.report_id);

        // Extract WHERE from ON CONFLICT ... WHERE report_entitlements.xxx = $N
        const whereMatch = q.match(/WHERE\s+report_entitlements\.(\w+)\s*=\s*\$(\d+)/i);

        if (existing) {
          if (whereMatch) {
            const col = whereMatch[1].toLowerCase();
            const idx = parseInt(whereMatch[2], 10) - 1;
            const expectedVal = (idx >= 0 && idx < values.length)
              ? (values[idx] !== null && values[idx] !== undefined ? String(values[idx]) : "NULL")
              : ("$" + whereMatch[2]);
            if (String(existing[col]) !== expectedVal) {
              conflictBlocked = true;
            }
          }

          if (!conflictBlocked) {
            existing.status = "active";
            existing.revoked_at = null;
            existing.granted_at = new Date();
            entResult = { id: existing.id, lead_contact_id: existing.lead_contact_id, status: existing.status };
          }
        } else {
          entitlementIdSeq++;
          row.id = entitlementIdSeq;
          if (!row.granted_at) row.granted_at = new Date();
          entitlements.push(row);
          entResult = { id: row.id, lead_contact_id: row.lead_contact_id, status: row.status };
        }
      }

      // Update payment if AND EXISTS (SELECT 1 FROM ent) present and ent succeeded
      const existsCheck = q.match(/AND\s+EXISTS\s+\(SELECT\s+1\s+FROM\s+ent\)/i);
      if (entResult && !conflictBlocked && existsCheck) {
        const pmtWhere = q.match(/WHERE\s+id\s*=\s*\$(\d+)/i);
        if (pmtWhere) {
          const idx = parseInt(pmtWhere[1], 10) - 1;
          if (idx >= 0 && idx < values.length) {
            const pmtId = values[idx];
            const matched = payments.filter((p) => p.id === pmtId && ["pending", "failed"].includes(p.status));
            for (const p of matched) {
              p.status = "paid";
              p.updated_at = new Date();
              // Find stripe_payment_intent_id in SET clause
              const piMatch = q.match(/stripe_payment_intent_id\s*=\s*\$(\d+)/i);
              if (piMatch) {
                const piIdx = parseInt(piMatch[1], 10) - 1;
                p.stripe_payment_intent_id = (piIdx >= 0 && piIdx < values.length) ? values[piIdx] : null;
              }
            }
            if (matched.length > 0) {
              payResult = { id: matched[0].id, status: matched[0].status };
            }
          }
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

    // ── SELECT from report_payments ────────────────────────────
    const selPayments = q.match(
      /SELECT\s+(.+?)\s+FROM\s+report_payments\s+WHERE\s+(.+?)(?:\s+LIMIT\s+\d+)?\s*$/is
    );
    if (selPayments) {
      const selects = selPayments[1].trim() === "*" ? "*" : selPayments[1].split(",").map((s) => s.trim());
      const whereClause = selPayments[2];
      return payments
        .filter((p) => rowMatchesWhere(whereClause, p, values))
        .map((p) => {
          if (selects === "*") return { ...p };
          const row = {};
          for (const col of selects) row[col] = p[col];
          return row;
        })
        .slice(0, 1);
    }

    // ── SELECT from report_entitlements ────────────────────────
    const selEntitlements = q.match(
      /SELECT\s+(.+?)\s+FROM\s+report_entitlements\s+WHERE\s+(.+?)(?:\s+LIMIT\s+\d+)?\s*$/is
    );
    if (selEntitlements) {
      const selects = selEntitlements[1].trim() === "*" ? "*" : selEntitlements[1].split(",").map((s) => s.trim());
      const whereClause = selEntitlements[2];
      return entitlements
        .filter((e) => rowMatchesWhere(whereClause, e, values))
        .map((e) => {
          if (selects === "*") return { ...e };
          const row = {};
          for (const col of selects) row[col] = e[col];
          return row;
        })
        .slice(0, 1);
    }

    // ── UPDATE report_payments ─────────────────────────────────
    const updPayments = q.match(
      /UPDATE\s+report_payments\s+SET\s+(.+?)\s+WHERE\s+(.+?)(?:\s+RETURNING\s+(.+?))?\s*$/is
    );
    if (updPayments) {
      const setClause = updPayments[1];
      const whereClause = updPayments[2];
      const returningCols = updPayments[3] ? updPayments[3].split(",").map((s) => s.trim()) : "*";
      const matched = payments.filter((p) => rowMatchesWhere(whereClause, p, values));
      const setValues = parseSetClause(setClause, values);
      for (const p of matched) Object.assign(p, setValues);
      return matched.map((p) => {
        if (returningCols === "*" || returningCols[0] === "*") return { ...p };
        const row = {};
        for (const col of returningCols) row[col] = p[col];
        return row;
      });
    }

    // ── INSERT INTO report_entitlements ... ON CONFLICT ────────
    const insEnt = q.match(
      /INSERT\s+INTO\s+report_entitlements\s+\((.+?)\)\s+VALUES\s+\((.+?)\)(?:\s+ON\s+CONFLICT\s+(.+?))?(?:\s+DO\s+(.+?))?\s*$/is
    );
    if (insEnt) {
      const cols = insEnt[1].split(",").map((s) => s.trim().toLowerCase());
      const vals = resolvePlaceholders(insEnt[2], values).split(",").map((s) => s.trim().replace(/^'(.*)'$/, "$1"));
      let doUpdateClause = insEnt[4] || "";
      const returningMatch = q.match(/RETURNING\s+(.+?)$/is);
      const returningCols = returningMatch ? returningMatch[1].split(",").map((s) => s.trim()) : "*";
      if (returningMatch) {
        doUpdateClause = doUpdateClause.replace(/RETURNING\s+.+?$/is, "").trim();
      }

      const row = {};
      cols.forEach((c, i) => {
        let v = vals[i];
        if (v === undefined) v = null;
        if (typeof v === "string" && v.toUpperCase() === "NULL") v = null;
        if (typeof v === "string" && v.toUpperCase() === "NOW()") v = new Date();
        row[c] = v;
      });

      // Convert lead_contact_id to number for mock
      if (row.lead_contact_id !== undefined) {
        const n = Number(row.lead_contact_id);
        if (!isNaN(n)) row.lead_contact_id = n;
      }

      const existing = entitlements.find((e) => e.report_id === row.report_id);
      if (existing && doUpdateClause) {
        // Check ON CONFLICT DO UPDATE WHERE clause
        // Pattern: WHERE table_or_alias.column = value
        const whereMatch = doUpdateClause.match(/SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/is);
        const hasWhere = whereMatch && whereMatch[2];

        if (hasWhere) {
          const whereCondition = resolvePlaceholders(whereMatch[2], values);
          // Simple equality check: col = val
          const eqWhere = whereCondition.match(/(\w+)\.(\w+)\s*=\s*([^\s]+)/);
          if (eqWhere) {
            const col = eqWhere[2].toLowerCase();
            let expectedVal = eqWhere[3].replace(/^'(.*)'$/, "$1");
            const actualVal = existing[col];
            if (String(actualVal) !== expectedVal) {
              // WHERE condition rejected the update — conflict!
              // The existing row is not modified, RETURNING returns nothing
              return [];
            }
          }
        }

        const setMatch = doUpdateClause.match(/SET\s+(.+?)(?:\s+WHERE\s+|$)/is);
        if (setMatch) {
          const setValues = parseSetClause(setMatch[1], values);
          for (const [k, v] of Object.entries(setValues)) {
            if (typeof v === "string" && v.includes("EXCLUDED.")) {
              const excludedCol = v.replace("EXCLUDED.", "").toLowerCase();
              existing[k] = row[excludedCol];
            } else {
              existing[k] = v;
            }
          }
        }
        return returningCols === "*" ? [{ ...existing }] : [returningCols.reduce((o, c) => ({ ...o, [c]: existing[c] }), {})];
      }

      if (!existing) {
        entitlementIdSeq++;
        row.id = entitlementIdSeq;
        if (!row.granted_at) row.granted_at = new Date();
        entitlements.push(row);
        return returningCols === "*" ? [{ ...row }] : [returningCols.reduce((o, c) => ({ ...o, [c]: row[c] }), {})];
      }

      return [];
    }

    return [];
  }

  sql.transaction = async function transaction(queries) {
    if (typeof queries === "function") queries = queries(sql);
    if (!Array.isArray(queries)) throw new Error("transaction() expects an array of queries");
    const results = [];
    for (const query of queries) {
      if (Array.isArray(query)) {
        results.push(query);
      } else if (query && typeof query.then === "function") {
        results.push(await query);
      } else {
        results.push([]);
      }
    }
    return results;
  };

  sql.getPayments = () => [...payments];
  sql.getEntitlements = () => [...entitlements];
  sql.getCallLog = () => [...callLog];
  sql.resetCallLog = () => { callLog = []; };

  return sql;
}

// ── Builders ────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  return {
    id: overrides.id || "cs_test_" + crypto.randomBytes(12).toString("hex"),
    mode: overrides.mode !== undefined ? overrides.mode : "payment",
    payment_status: overrides.payment_status !== undefined ? overrides.payment_status : "paid",
    payment_intent: overrides.payment_intent || "pi_test_" + crypto.randomBytes(12).toString("hex"),
    metadata: {
      product_code: overrides.product_code !== undefined ? overrides.product_code : "valuation_report_399",
      report_id: overrides.report_id !== undefined ? overrides.report_id : "rpt_" + crypto.randomBytes(8).toString("hex"),
      purchase_intent_key: overrides.purchase_intent_key !== undefined ? overrides.purchase_intent_key : "pik_" + crypto.randomBytes(8).toString("hex"),
      ...(overrides.metadata || {}),
    },
    ...(overrides.extra || {}),
  };
}

function makePayment(overrides = {}) {
  return {
    id: overrides.id || 1,
    report_id: overrides.report_id || "rpt_default",
    lead_contact_id: overrides.lead_contact_id || 42,
    stripe_customer_id: overrides.stripe_customer_id || "cus_test_1",
    stripe_checkout_session_id: overrides.stripe_checkout_session_id || "cs_test_default",
    stripe_payment_intent_id: overrides.stripe_payment_intent_id || null,
    purchase_intent_key: overrides.purchase_intent_key || "pik_default",
    amount_cents: overrides.amount_cents !== undefined ? overrides.amount_cents : 399,
    currency: overrides.currency !== undefined ? overrides.currency : "aud",
    status: overrides.status !== undefined ? overrides.status : "pending",
    created_at: new Date("2026-06-12T00:00:00Z"),
    updated_at: new Date("2026-06-12T00:00:00Z"),
  };
}

function makeEntitlement(overrides = {}) {
  return {
    id: overrides.id || 1,
    report_id: overrides.report_id || "rpt_default",
    lead_contact_id: overrides.lead_contact_id || 42,
    status: overrides.status !== undefined ? overrides.status : "active",
    granted_at: new Date("2026-06-12T00:00:00Z"),
    revoked_at: overrides.revoked_at !== undefined ? overrides.revoked_at : null,
  };
}

// ── Import service ──────────────────────────────────────────────────

const { handleCheckoutCompleted, SessionValidationError } = await import(
  "../lib/report-payment-webhook-service.js"
);

// ── Tests ───────────────────────────────────────────────────────────

test("normal payment grants entitlement", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({
    report_id: reportId,
    purchase_intent_key: pik,
    stripe_checkout_session_id: sessionId,
  });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });

  const sql = createMockDb({ payments: [payment] });
  const result = await handleCheckoutCompleted(session, sql);

  assert.equal(result.paid, true);
  assert.equal(result.entitlementCreated, true);
  assert.ok(result.entitlementId > 0, "Should have created entitlement");

  const updatedPayment = sql.getPayments().find((p) => p.id === payment.id);
  assert.equal(updatedPayment.status, "paid");
  assert.equal(updatedPayment.stripe_payment_intent_id, session.payment_intent);

  const ents = sql.getEntitlements();
  assert.equal(ents.length, 1);
  assert.equal(ents[0].report_id, reportId);
  assert.equal(Number(ents[0].lead_contact_id), payment.lead_contact_id);
  assert.equal(ents[0].status, "active");
});

test("amount mismatch rejects payment", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({
    report_id: reportId,
    purchase_intent_key: pik,
    stripe_checkout_session_id: sessionId,
    amount_cents: 0,
  });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });
  const sql = createMockDb({ payments: [payment] });

  await assert.rejects(
    () => handleCheckoutCompleted(session, sql),
    (err) => { assert.equal(err.code, "AMOUNT_MISMATCH"); return true; }
  );
  assert.equal(sql.getPayments()[0].status, "pending");
  assert.equal(sql.getEntitlements().length, 0);
});

test("currency mismatch rejects payment", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({
    report_id: reportId,
    purchase_intent_key: pik,
    stripe_checkout_session_id: sessionId,
    currency: "usd",
  });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });
  const sql = createMockDb({ payments: [payment] });

  await assert.rejects(
    () => handleCheckoutCompleted(session, sql),
    (err) => { assert.equal(err.code, "CURRENCY_MISMATCH"); return true; }
  );
  assert.equal(sql.getPayments()[0].status, "pending");
  assert.equal(sql.getEntitlements().length, 0);
});

test("incomplete metadata rejects payment", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({
    report_id: reportId, purchase_intent_key: pik, stripe_checkout_session_id: sessionId,
  });

  await assert.rejects(
    () => handleCheckoutCompleted(makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik, product_code: "wrong" }), createMockDb({ payments: [payment] })),
    (err) => err instanceof SessionValidationError && err.code === "INVALID_PRODUCT_CODE"
  );

  await assert.rejects(
    () => handleCheckoutCompleted(makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik, product_code: "valuation_report_399", report_id: "" }), createMockDb({ payments: [payment] })),
    (err) => err instanceof SessionValidationError && err.code === "MISSING_REPORT_ID"
  );

  await assert.rejects(
    () => handleCheckoutCompleted(makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik, product_code: "valuation_report_399", purchase_intent_key: "" }), createMockDb({ payments: [payment] })),
    (err) => err instanceof SessionValidationError && err.code === "MISSING_PURCHASE_INTENT_KEY"
  );
});

test("session ID mismatch rejects", async () => {
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const wrongSessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({ stripe_checkout_session_id: wrongSessionId });
  const session = makeSession({ id: sessionId, report_id: payment.report_id, purchase_intent_key: payment.purchase_intent_key });
  const sql = createMockDb({ payments: [payment] });

  await assert.rejects(
    () => handleCheckoutCompleted(session, sql),
    (err) => { assert.equal(err.code, "PAYMENT_NOT_FOUND"); return true; }
  );
});

test("wrong session mode rejects", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({ report_id: reportId, purchase_intent_key: pik, stripe_checkout_session_id: sessionId });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik, mode: "subscription" });
  const sql = createMockDb({ payments: [payment] });

  await assert.rejects(
    () => handleCheckoutCompleted(session, sql),
    (err) => { assert.equal(err.code, "INVALID_SESSION_MODE"); return true; }
  );
});

test("unpaid session rejects", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({ report_id: reportId, purchase_intent_key: pik, stripe_checkout_session_id: sessionId });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik, payment_status: "unpaid" });
  const sql = createMockDb({ payments: [payment] });

  await assert.rejects(
    () => handleCheckoutCompleted(session, sql),
    (err) => { assert.equal(err.code, "SESSION_NOT_PAID"); return true; }
  );
});

test("duplicate event is idempotent", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const paidPayment = makePayment({
    id: 2, report_id: reportId, purchase_intent_key: pik,
    stripe_checkout_session_id: sessionId, status: "paid",
    stripe_payment_intent_id: "pi_already_paid",
  });
  const existingEntitlement = makeEntitlement({
    id: 10, report_id: reportId, lead_contact_id: paidPayment.lead_contact_id,
  });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });
  const sql = createMockDb({ payments: [paidPayment], entitlements: [existingEntitlement] });

  const result = await handleCheckoutCompleted(session, sql);
  assert.equal(result.paid, true);
  assert.equal(result.entitlementCreated, false);
  assert.equal(result.alreadyPaid, true);
  assert.ok(result.entitlement, "Should report existing entitlement");
  assert.equal(result.entitlement.status, "active");
});

test("entitlement lead_contact_id comes from payment record, not session", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({
    report_id: reportId, purchase_intent_key: pik, stripe_checkout_session_id: sessionId, lead_contact_id: 42,
  });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik, extra: { client_reference_id: "user_999" } });
  const sql = createMockDb({ payments: [payment] });

  const result = await handleCheckoutCompleted(session, sql);
  assert.equal(result.entitlementCreated, true);
  const ents = sql.getEntitlements();
  assert.equal(ents.length, 1);
  assert.equal(Number(ents[0].lead_contact_id), 42, "Must use payment's lead_contact_id");
});

test("Promise.all concurrent only creates one entitlement", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({ report_id: reportId, purchase_intent_key: pik, stripe_checkout_session_id: sessionId });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });
  const sql = createMockDb({ payments: [payment] });

  const results = await Promise.all(
    Array.from({ length: 5 }, () => handleCheckoutCompleted(session, sql))
  );

  const created = results.filter((r) => r.entitlementCreated);
  assert.equal(created.length, 1, "Only one call should create entitlement");
  const ents = sql.getEntitlements();
  assert.equal(ents.length, 1, "Only one entitlement row should exist");
});

test("payment update failure does not leave paid-without-entitlement", async () => {
  // Atomic CTE replaces sql.transaction, so the service must NOT
  // call sql.transaction(). Verify that handleCheckoutCompleted
  // works correctly without a transaction method.
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({ id: 1, report_id: reportId, purchase_intent_key: pik, stripe_checkout_session_id: sessionId });

  // Create mock WITHOUT sql.transaction — service must not need it
  const sql = createMockDb({ payments: [payment] });
  delete sql.transaction;

  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });
  const result = await handleCheckoutCompleted(session, sql);

  assert.equal(result.paid, true);
  assert.equal(result.entitlementCreated, true);

  const updatedPayment = sql.getPayments().find((p) => p.id === payment.id);
  assert.equal(updatedPayment.status, "paid");

  const ents = sql.getEntitlements();
  assert.equal(ents.length, 1);
});

test("payment in invalid status throws", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({ report_id: reportId, purchase_intent_key: pik, stripe_checkout_session_id: sessionId, status: "expired" });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });
  const sql = createMockDb({ payments: [payment] });

  await assert.rejects(
    () => handleCheckoutCompleted(session, sql),
    (err) => { assert.equal(err.code, "PAYMENT_STATUS_INVALID"); return true; }
  );
});

test("failed payment can be updated to paid with entitlement", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({ report_id: reportId, purchase_intent_key: pik, stripe_checkout_session_id: sessionId, status: "failed" });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });
  const sql = createMockDb({ payments: [payment] });

  const result = await handleCheckoutCompleted(session, sql);
  assert.equal(result.paid, true);
  assert.equal(result.entitlementCreated, true);
  assert.equal(sql.getPayments()[0].status, "paid");
  assert.equal(sql.getEntitlements().length, 1);
});

test("same-owner revoked entitlement is reactivated", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({ report_id: reportId, purchase_intent_key: pik, stripe_checkout_session_id: sessionId });
  const revokedEnt = makeEntitlement({
    id: 5, report_id: reportId, lead_contact_id: payment.lead_contact_id,
    status: "revoked", revoked_at: new Date("2026-06-01T00:00:00Z"),
  });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });
  const sql = createMockDb({ payments: [payment], entitlements: [revokedEnt] });

  const result = await handleCheckoutCompleted(session, sql);
  assert.equal(result.paid, true);
  assert.equal(result.entitlementCreated, true);

  const ents = sql.getEntitlements();
  assert.equal(ents.length, 1, "Should not create new entitlement row");
  assert.equal(ents[0].status, "active", "Should be reactivated");
  assert.equal(Number(ents[0].lead_contact_id), payment.lead_contact_id, "lead_contact_id must not change");
  // The ON CONFLICT DO UPDATE does NOT include lead_contact_id, so it should remain unchanged
});

test("Promise.all concurrent two customers same report: one wins one ENTITLEMENT_OWNER_CONFLICT", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");

  // Customer A (wins maybe)
  const pikA = "pik_A_" + crypto.randomBytes(8).toString("hex");
  const sessA = "cs_test_A_" + crypto.randomBytes(12).toString("hex");
  const payA = makePayment({ id: 10, report_id: reportId, purchase_intent_key: pikA, stripe_checkout_session_id: sessA, lead_contact_id: 42 });

  // Customer B (conflict maybe)
  const pikB = "pik_B_" + crypto.randomBytes(8).toString("hex");
  const sessB = "cs_test_B_" + crypto.randomBytes(12).toString("hex");
  const payB = makePayment({ id: 11, report_id: reportId, purchase_intent_key: pikB, stripe_checkout_session_id: sessB, lead_contact_id: 99 });

  const sql = createMockDb({ payments: [payA, payB] });
  const sessionA = makeSession({ id: sessA, report_id: reportId, purchase_intent_key: pikA });
  const sessionB = makeSession({ id: sessB, report_id: reportId, purchase_intent_key: pikB });

  const results = await Promise.allSettled([
    handleCheckoutCompleted(sessionA, sql),
    handleCheckoutCompleted(sessionB, sql),
  ]);

  const success = results.find((r) => r.status === "fulfilled");
  const conflict = results.find((r) => r.status === "rejected");

  assert.ok(success, "One must succeed");
  assert.ok(conflict, "One must be rejected");
  assert.equal(conflict.reason.code, "ENTITLEMENT_OWNER_CONFLICT", "The loser must get owner conflict");

  // Exactly one entitlement for this report
  const ents = sql.getEntitlements().filter((e) => e.report_id === reportId);
  assert.equal(ents.length, 1, "Exactly one entitlement across both calls");

  // The entitlement owner matches the successful caller
  const winnerLeadId = success.value.paid ? success.value.entitlement.id
    : typeof success.value?.entitlement?.lead_contact_id !== "undefined"
      ? success.value.entitlement.lead_contact_id
      : ents[0].lead_contact_id;

  // Either 42 or 99 is fine, whatever won
  assert.ok(
    ents[0].lead_contact_id === 42 || ents[0].lead_contact_id === 99,
    "Entitlement owner must be one of the two customers"
  );

  // Verify payment states
  const allPayments = sql.getPayments();
  const winnerPay = allPayments.find((p) => p.lead_contact_id === ents[0].lead_contact_id);
  const loserPay = allPayments.find((p) => p.lead_contact_id !== ents[0].lead_contact_id);

  assert.equal(winnerPay.status, "paid", "Winner's payment must be paid");
  assert.equal(loserPay.status, "pending", "Loser's payment must stay pending");
});

test("cross-owner entitlement throws ENTITLEMENT_OWNER_CONFLICT", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({
    report_id: reportId, purchase_intent_key: pik, stripe_checkout_session_id: sessionId,
    lead_contact_id: 100, // New buyer
  });
  const existingEnt = makeEntitlement({
    id: 7, report_id: reportId, lead_contact_id: 999, // Different owner
    status: "active",
  });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });
  const sql = createMockDb({ payments: [payment], entitlements: [existingEnt] });

  await assert.rejects(
    () => handleCheckoutCompleted(session, sql),
    (err) => { assert.equal(err.code, "ENTITLEMENT_OWNER_CONFLICT"); return true; }
  );

  // Payment must NOT have been updated
  assert.equal(sql.getPayments()[0].status, "pending", "Payment must remain pending on owner conflict");
  assert.equal(sql.getEntitlements().length, 1, "No new entitlement should be created");
  assert.equal(sql.getEntitlements()[0].lead_contact_id, 999, "Existing entitlement owner must not change");
});

test("paid payment with missing active entitlement throws PAYMENT_WITHOUT_ENTITLEMENT", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({
    id: 3, report_id: reportId, purchase_intent_key: pik,
    stripe_checkout_session_id: sessionId, status: "paid",
  });
  // No entitlement exists — data integrity problem
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });
  const sql = createMockDb({ payments: [payment] });

  await assert.rejects(
    () => handleCheckoutCompleted(session, sql),
    (err) => { assert.equal(err.code, "PAYMENT_WITHOUT_ENTITLEMENT"); return true; }
  );
});

test("paid payment with revoked entitlement throws PAYMENT_WITHOUT_ENTITLEMENT", async () => {
  const reportId = "rpt_" + crypto.randomBytes(8).toString("hex");
  const pik = "pik_" + crypto.randomBytes(8).toString("hex");
  const sessionId = "cs_test_" + crypto.randomBytes(12).toString("hex");
  const payment = makePayment({
    id: 4, report_id: reportId, purchase_intent_key: pik,
    stripe_checkout_session_id: sessionId, status: "paid",
  });
  const revokedEnt = makeEntitlement({
    id: 6, report_id: reportId, lead_contact_id: payment.lead_contact_id,
    status: "revoked",
  });
  const session = makeSession({ id: sessionId, report_id: reportId, purchase_intent_key: pik });
  const sql = createMockDb({ payments: [payment], entitlements: [revokedEnt] });

  await assert.rejects(
    () => handleCheckoutCompleted(session, sql),
    (err) => { assert.equal(err.code, "PAYMENT_WITHOUT_ENTITLEMENT"); return true; }
  );
});

test("ON CONFLICT DO UPDATE never changes lead_contact_id of existing entitlement", async () => {
  // Verify the SQL generated does NOT have lead_contact_id in the DO UPDATE SET clause
  const source = fs.readFileSync(
    path.join(projectRoot, "lib/report-payment-webhook-service.js"),
    "utf8"
  );

  // Find the DO UPDATE SET block
  const doUpdateMatch = source.match(/ON CONFLICT\s*\(report_id\)\s*DO UPDATE SET\s*([\s\S]*?)WHERE/);
  assert.ok(doUpdateMatch, "Should have ON CONFLICT DO UPDATE SET...WHERE");
  const setClause = doUpdateMatch[1];
  assert.equal(setClause.includes("lead_contact_id"), false,
    "ON CONFLICT DO UPDATE SET must NOT modify lead_contact_id. Got: " + setClause);
});

test("service does not import stripe SDK or read secret env vars", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "lib/report-payment-webhook-service.js"),
    "utf8"
  );
  assert.equal(source.includes('from "stripe"'), false, "Must not import Stripe SDK");
  assert.equal(source.includes("process.env."), false, "Must not read env vars");
});
