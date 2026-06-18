// ── Report Draft & Snapshot Service ──
// Phase 1B: Free valuation → short-lived signed draft token
//           Checkout → consume draft → immutable report_snapshot
//
// Vercel serverless compatible — uses crypto.createHmac.
// No Stripe dependency.
// No Opportunity cookie reuse.

import crypto from "node:crypto";

/**
 * DraftTokenError — typed error for consumeDraftIntoSnapshot failures.
 * The handler uses instanceof + .code to distinguish INVALID_DRAFT_TOKEN
 * from DRAFT_EXPIRED without fragile message.includes checks.
 */
export class DraftTokenError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DraftTokenError";
    this.code = code;
  }
}

/**
 * Draft token TTL: 30 minutes.
 */
const DRAFT_TTL_MS = 30 * 60 * 1000;

/**
 * Draft token secret — uses same TOKEN_SIGNING_SECRET as signed-token.js
 * with a "report-draft" context prefix to avoid key reuse collisions.
 */
function getDraftSecret() {
  const base = process.env.TOKEN_SIGNING_SECRET || process.env.SESSION_SECRET;
  if (!base) {
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      return "report-draft-dev-secret";
    }
    throw new Error(
      "TOKEN_SIGNING_SECRET environment variable is required for report draft tokens"
    );
  }
  // Derive a separate key from the shared secret to avoid signature reuse
  return crypto.createHmac("sha256", base).update("report-draft-v1").digest("hex");
}

/**
 * Generate a crypto-random draft ID.
 */
function generateDraftId() {
  return "rd_" + crypto.randomBytes(12).toString("hex");
}

/**
 * Stable JSON serialisation for hash integrity.
 *
 * Neon returns JSONB columns as parsed objects.  This function normalises
 * both strings (already JSON) and objects into the same canonical form so
 * the hash at creation time matches the hash at consumption time.
 *
 * - String inputs are JSON.parsed then re-stringified for normalisation.
 * - Object inputs are stringified with stable numeric / object-key ordering.
 */
export function stableStringify(input) {
  // If it's already a string, parse it to normalise key ordering
  const obj = typeof input === "string" ? JSON.parse(input) : input;
  const result = stableJson(obj);
  if (result === undefined) {
    throw new TypeError("Snapshot content is not JSON serializable");
  }
  return result;
}

function stableJson(val) {
  if (val === null) return "null";
  if (val === undefined || typeof val === "function" || typeof val === "symbol") {
    return undefined;
  }
  if (typeof val === "boolean") return JSON.stringify(val);
  if (typeof val === "number") return Number.isFinite(val) ? JSON.stringify(val) : "null";
  if (typeof val === "string") return JSON.stringify(val);
  if (typeof val === "bigint") {
    throw new TypeError("BigInt values are not JSON serializable");
  }
  if (val && typeof val.toJSON === "function") {
    return stableJson(val.toJSON());
  }
  if (Array.isArray(val)) {
    return "[" + val.map(item => stableJson(item) ?? "null").join(",") + "]";
  }
  if (typeof val === "object") {
    const keys = Object.keys(val).sort();
    const entries = [];
    for (const key of keys) {
      const encoded = stableJson(val[key]);
      if (encoded !== undefined) {
        entries.push(JSON.stringify(key) + ":" + encoded);
      }
    }
    return "{" + entries.join(",") + "}";
  }
  return undefined;
}

/**
 * Hash the snapshot content for integrity verification.
 * Accepts both string (JSON) and parsed-object forms (Neon JSONB output).
 */
export function hashSnapshot(content) {
  const normalised = stableStringify(content);
  return crypto.createHash("sha256").update(normalised).digest("hex");
}

/**
 * Extract a deterministic property_key from the valuation result.
 * Format: normalizedAddress|suburb|state|postcode|propertyType
 */
export function buildPropertyKey(fullResult) {
  const subject = fullResult.subject || {};
  const address = (fullResult.cleanStreet || subject.cleanStreet || fullResult.address || subject.address || "").trim();
  const suburb = (fullResult.suburb || subject.suburb || "").trim();
  const state = (fullResult.state || subject.state || "").trim();
  const postcode = (fullResult.postcode || subject.postcode || "").trim();
  const type = (fullResult.propertyType || subject.propertyType || "").trim().toLowerCase();
  return `${address}|${suburb}|${state}|${postcode}|${type}`;
}

/**
 * Extract a valuation version string from the result.
 */
function buildValuationVersion(fullResult) {
  return fullResult.modelVersion || "1.0.0";
}

/**
 * Create a report draft:
 * 1. Generate draft_id
 * 2. Compute snapshot JSON and hash
 * 3. Store in report_drafts table
 * 4. Return a signed token (does NOT include full snapshot)
 *
 * @param {object} fullResult — the full valuation result from runValuation()
 * @param {function} sql — neon SQL executor
 * @returns {object} { draftToken, draftExpiresAt }
 */
export async function createReportDraft(fullResult, sql) {
  // Build key fields server-side
  const propertyKey = buildPropertyKey(fullResult);
  const valuationVersion = buildValuationVersion(fullResult);
  const draftId = generateDraftId();

  // Build snapshot payload — capture everything needed for the full report.
  // stableStringify ensures hash consistency regardless of key ordering.
  const snapshotObject = buildReportSnapshot(fullResult);
  const snapshotJson = stableStringify(snapshotObject);
  const snapshotHash = hashSnapshot(snapshotJson);

  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);

  // Store draft in database
  await sql`
    INSERT INTO report_drafts (draft_id, property_key, valuation_version, snapshot_json, snapshot_hash, expires_at)
    VALUES (${draftId}, ${propertyKey}, ${valuationVersion}, ${snapshotJson}, ${snapshotHash}, ${expiresAt.toISOString()})
  `;

  // Create a signed token (no snapshot JSON in token)
  const tokenPayload = {
    draft_id: draftId,
    property_key: propertyKey,
    valuation_version: valuationVersion,
    snapshot_hash: snapshotHash,
    issued_at: Date.now(),
    expires_at: expiresAt.getTime(),
  };

  const draftToken = signDraftToken(tokenPayload);

  return {
    draftToken,
    draftExpiresAt: expiresAt.toISOString(),
  };
}

/**
 * Verify a draft token.
 * Returns decoded payload if valid, null otherwise.
 */
export function verifyReportDraftToken(token) {
  if (!token || typeof token !== "string") return null;
  const secret = getDraftSecret();

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;

  const expectedSig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));

    // Check expiry
    if (data.expires_at && data.expires_at < Date.now()) return null;

    // Verify required fields exist
    if (!data.draft_id || !data.property_key || !data.snapshot_hash) return null;

    return data;
  } catch {
    return null;
  }
}

/**
 * Validate leadContactId is a positive integer.
 */
function validateLeadContactId(id) {
  if (id === null || id === undefined) return false;
  if (typeof id === "number" && Number.isInteger(id) && id > 0) return true;
  if (typeof id === "string") {
    const n = Number(id);
    if (Number.isInteger(n) && n > 0) return true;
  }
  return false;
}

/**
 * Consume a draft into an immutable report_snapshot.
 *
 * Strategy (defence against concurrent writes):
 *  1. Try atomic INSERT … ON CONFLICT (draft_id) DO NOTHING RETURNING report_id
 *  2. If the INSERT returns a row → this caller won the race; mark draft consumed,
 *     return the newly created report_id.
 *  3. If the INSERT returns nothing (another TX inserted first) → re-SELECT the
 *     existing snapshot for this draft.  Retry up to 3 times with back-off.
 *  4. If after all retries no snapshot is found ─ fail (should not happen with a
 *     valid draft unless a concurrent consume is still in-flight beyond TTL).
 *
 * @param {string} token — signed draft token
 * @param {number} leadContactId — purchaser's lead_contact_id (must be > 0)
 * @param {function} sql — neon SQL executor
 * @returns {object} { report_id, alreadyConsumed }
 */
export async function consumeDraftIntoSnapshot(token, leadContactId, sql) {
  // 0. Validate leadContactId
  if (!validateLeadContactId(leadContactId)) {
    throw new DraftTokenError("Invalid lead_contact_id: must be a positive integer", "INVALID_PARAM");
  }

  // 1. Verify token
  const payload = verifyReportDraftToken(token);
  if (!payload) {
    throw new DraftTokenError("The report draft token is invalid or has been tampered with.", "TOKEN_INVALID");
  }

  const { draft_id, snapshot_hash: tokenHash } = payload;

  // Note: token level expiry check already happened in verifyReportDraftToken
  // which returns null for expired tokens. The token was valid when this
  // function received it — now proceed with DB operations.

  // 2. Check if already consumed (idempotency, fast path)
  const existing = await sql`
    SELECT report_id, lead_contact_id FROM report_snapshots WHERE draft_id = ${draft_id}
  `;
  if (existing.length > 0) {
    const existingRow = existing[0];
    if (existingRow.lead_contact_id === null || existingRow.lead_contact_id === undefined) {
      // Old snapshot without owner - bind atomically
      const updated = await sql`
        UPDATE report_snapshots SET lead_contact_id = ${leadContactId}
        WHERE report_id = ${existingRow.report_id}
          AND lead_contact_id IS NULL
        RETURNING report_id
      `;
      if (updated.length > 0) {
        return { report_id: existingRow.report_id, alreadyConsumed: true };
      }
      // Another caller bound first - re-read
      const recheck = await sql`
        SELECT report_id, lead_contact_id FROM report_snapshots WHERE draft_id = ${draft_id}
      `;
      if (recheck.length > 0) {
        if (Number(recheck[0].lead_contact_id) !== Number(leadContactId)) {
          throw new DraftTokenError(
            "This report already belongs to another customer.",
            "REPORT_OWNER_CONFLICT"
          );
        }
        return { report_id: recheck[0].report_id, alreadyConsumed: true };
      }
    } else if (Number(existingRow.lead_contact_id) !== Number(leadContactId)) {
      throw new DraftTokenError(
        "This report already belongs to another customer.",
        "REPORT_OWNER_CONFLICT"
      );
    }
    return { report_id: existingRow.report_id, alreadyConsumed: true };
  }

  // 3. Read draft from DB — includes DB-side expiry check
  const drafts = await sql`
    SELECT * FROM report_drafts
    WHERE draft_id = ${draft_id}
      AND consumed_at IS NULL
      AND expires_at > NOW()
  `;
  if (drafts.length === 0) {
    throw new DraftTokenError("The report draft has expired or is no longer valid.", "TOKEN_EXPIRED");
  }
  const draft = drafts[0];

  // 4. Verify hash integrity (token hash vs stored hash)
  if (draft.snapshot_hash !== tokenHash) {
    throw new DraftTokenError("Snapshot hash mismatch — draft data has been tampered with.", "TOKEN_INVALID");
  }

  // 5. Verify hash matches stored JSON (integrity check)
  const computedHash = hashSnapshot(draft.snapshot_json);
  if (computedHash !== draft.snapshot_hash) {
    throw new DraftTokenError("Snapshot hash verification failed — stored data integrity error.", "TOKEN_INVALID");
  }

  // 6. Generate report_id
  const reportId = "rp_" + Date.now() + "_" + crypto.randomBytes(8).toString("hex");

  // 7. Atomic INSERT with ON CONFLICT DO NOTHING — no CTE wrapper needed
  //    because we handle the fallback SELECT inline after.
  const insertResult = await sql`
    INSERT INTO report_snapshots (report_id, draft_id, property_key, valuation_version, snapshot_json, snapshot_hash, lead_contact_id)
    VALUES (${reportId}, ${draft_id}, ${draft.property_key}, ${draft.valuation_version}, ${draft.snapshot_json}, ${draft.snapshot_hash}, ${leadContactId})
    ON CONFLICT (draft_id) DO NOTHING
    RETURNING report_id
  `;

  if (insertResult.length > 0 && insertResult[0].report_id) {
    // We won — this caller inserted the snapshot.
    // Mark draft consumed (best-effort; the snapshot itself gates uniqueness).
    await sql`
      UPDATE report_drafts SET consumed_at = NOW()
      WHERE draft_id = ${draft_id}
        AND consumed_at IS NULL
    `;
    return { report_id: insertResult[0].report_id, alreadyConsumed: false };
  }

  // 8. Another concurrent caller inserted first; wait briefly and re-read.
  //    Retry up to 3 times so eventual consistency is guaranteed.
  const MAX_RETRIES = 3;
  const BACKOFF_MS = 50;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Small back-off so the inserting transaction can commit
    // and become visible to our subsequent snapshot (different TX).
    if (attempt > 1) {
      await sleep(BACKOFF_MS * attempt);
    }

    // The inserting TX may still be in-flight; re-SELECT.
    const laterResult = await sql`
      SELECT report_id, lead_contact_id FROM report_snapshots WHERE draft_id = ${draft_id}
    `;
    if (laterResult.length > 0 && laterResult[0].report_id) {
      const lr = laterResult[0];
      if (lr.lead_contact_id === null || lr.lead_contact_id === undefined) {
        // Retry path: old snapshot without owner - bind atomically
        const updated = await sql`
          UPDATE report_snapshots SET lead_contact_id = ${leadContactId}
          WHERE report_id = ${lr.report_id}
            AND lead_contact_id IS NULL
          RETURNING report_id
        `;
        if (updated.length > 0) {
          return { report_id: lr.report_id, alreadyConsumed: true };
        }
        // Another caller bound first - re-read
        const recheck = await sql`
          SELECT report_id, lead_contact_id FROM report_snapshots WHERE draft_id = ${draft_id}
        `;
        if (recheck.length > 0 && Number(recheck[0].lead_contact_id) !== Number(leadContactId)) {
          throw new DraftTokenError(
            "This report already belongs to another customer.",
            "REPORT_OWNER_CONFLICT"
          );
        }
        return { report_id: lr.report_id, alreadyConsumed: true };
      } else if (Number(lr.lead_contact_id) !== Number(leadContactId)) {
        throw new DraftTokenError(
          "This report already belongs to another customer.",
          "REPORT_OWNER_CONFLICT"
        );
      }
      return { report_id: lr.report_id, alreadyConsumed: true };
    }
  }

  throw new DraftTokenError("Failed to create or retrieve report snapshot — concurrent consume may still be in-flight.", "TOKEN_EXPIRED");
}

/**
 * Promise-based sleep for retry back-off.
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Internal helpers ────────────────────────────────────────────────

/**
 * Build the snapshot JSON from the full valuation result.
 * This is the immutable payload that gets frozen at purchase time.
 *
 * ⚠️ Production runValuation returns:
 *   valuation.estimate.{midpoint, low, high}
 * NOT valuation.{midpoint, low, high}.
 */
function buildReportSnapshot(fullResult) {
  const val = fullResult.valuation || {};
  const estimate = val.estimate || {};
  const subj = fullResult.subject || {};

  return {
    engineVersion: fullResult.modelVersion || "1.0.0",
    collectedAt: fullResult.collectedAt || new Date().toISOString(),
    asOfDate: fullResult.asOfDate || new Date().toISOString().slice(0, 10),
    // ── New canonical subject block ──
    subject: {
      address: subj.address || null,
      suburb: subj.suburb || null,
      state: subj.state || null,
      postcode: subj.postcode || null,
      propertyType: subj.propertyType || null,
      bedrooms: subj.bedrooms != null ? subj.bedrooms : null,
      bathrooms: subj.bathrooms != null ? subj.bathrooms : null,
      carSpaces: subj.carSpaces != null ? subj.carSpaces : null,
      landSize: subj.landSize != null ? subj.landSize : null,
      landSizeSource: subj.landSizeSource || null,
      buildingArea: subj.buildingArea != null ? subj.buildingArea : null,
      yearBuilt: subj.yearBuilt != null ? subj.yearBuilt : null,
    },
    estimate: {
      midpoint: estimate.midpoint || null,
      low: estimate.low || null,
      high: estimate.high || null,
    },
    confidence: val.confidence || null,
    comparables: val.acceptedComparables || fullResult.comparables || [],
    multiSourceAnalysis: val.multiSourceAnalysis || null,
    keyFactors: val.keyFactors || [],
    dataLimitations: val.dataLimitations || [],
    propertyFutureOutlook: fullResult.propertyFutureOutlook || null,
    suburbFutureOutlook: fullResult.suburbFutureOutlook || null,
    // ── Valuation mode fields ──
    valuationMode: fullResult.valuationMode || null,
    largeLotDetect: fullResult.largeLotDetect || null,
    largeLotResult: fullResult.largeLotResult || null,
    // ── Legacy fields (preserved for backward compat) ──
    addressVerification: {
      address: subj.address || null,
      suburb: subj.suburb || null,
      state: subj.state || null,
      postcode: subj.postcode || null,
      propertyType: subj.propertyType || null,
      landSize: subj.landSize || null,
    },
    customerData: {
      bedrooms: subj.bedrooms != null ? subj.bedrooms : null,
      bathrooms: subj.bathrooms != null ? subj.bathrooms : null,
      carSpaces: subj.carSpaces != null ? subj.carSpaces : null,
    },
    factorAdjustments: estimate.factorAdjustments || null,
    factorTotal: estimate.factorTotal || null,
    anchor: estimate.anchor || null,
    weightedMedian: estimate.weightedMedian || null,
    adjustmentDetail: fullResult.adjustmentDetail || null,
    censusSignals: fullResult.censusSignals || null,
    cdpData: fullResult.cdpData || null,
    evidenceMode: fullResult.evidenceMode || null,
    dataSourceMap: fullResult.dataSourceMap || null,
  };
}

/**
 * Sign a draft token payload with HMAC-SHA256.
 */
function signDraftToken(payload) {
  const secret = getDraftSecret();
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}
