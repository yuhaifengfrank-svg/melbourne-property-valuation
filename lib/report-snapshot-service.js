// ── Report Draft & Snapshot Service ──
// Phase 1B: Free valuation → short-lived signed draft token
//           Checkout → consume draft → immutable report_snapshot
//
// Vercel serverless compatible — uses crypto.createHmac.
// No Stripe dependency.
// No Opportunity cookie reuse.

import crypto from "node:crypto";

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
 * Hash the snapshot JSON for integrity verification.
 */
export function hashSnapshot(snapshotJson) {
  return crypto.createHash("sha256").update(snapshotJson).digest("hex");
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

  // Build snapshot payload — capture everything needed for the full report
  const snapshotJson = JSON.stringify(buildReportSnapshot(fullResult));
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
 * Consume a draft into an immutable report_snapshot.
 * - Verifies token signature and expiry
 * - Reads draft from DB
 * - Verifies snapshot_hash matches
 * - Atomically writes report_snapshot
 * - Marks draft as consumed
 *
 * Idempotent: repeated calls return same report_id.
 *
 * @param {string} token — signed draft token
 * @param {number} leadContactId — purchaser's lead_contact_id
 * @param {function} sql — neon SQL executor
 * @returns {object} { report_id, alreadyConsumed }
 */
export async function consumeDraftIntoSnapshot(token, leadContactId, sql) {
  // 1. Verify token
  const payload = verifyReportDraftToken(token);
  if (!payload) {
    throw new Error("Invalid or expired draft token");
  }

  const { draft_id } = payload;

  // 2. Check if already consumed (idempotency)
  const existing = await sql`
    SELECT report_id FROM report_snapshots WHERE draft_id = ${draft_id}
  `;
  if (existing.length > 0) {
    return { report_id: existing[0].report_id, alreadyConsumed: true };
  }

  // 3. Read draft from DB
  const drafts = await sql`
    SELECT * FROM report_drafts WHERE draft_id = ${draft_id} AND consumed_at IS NULL
  `;
  if (drafts.length === 0) {
    throw new Error("Draft not found or already consumed");
  }
  const draft = drafts[0];

  // 4. Verify hash integrity
  if (draft.snapshot_hash !== payload.snapshot_hash) {
    throw new Error("Snapshot hash mismatch — draft data has been tampered with");
  }

  // 5. Verify hash matches stored JSON
  const computedHash = hashSnapshot(draft.snapshot_json);
  if (computedHash !== draft.snapshot_hash) {
    throw new Error("Snapshot hash verification failed — stored data integrity error");
  }

  // 6. Generate report_id
  const reportId = "rp_" + Date.now() + "_" + crypto.randomBytes(8).toString("hex");

  // 7. Atomic write: snapshot + mark draft consumed
  await sql`
    INSERT INTO report_snapshots (report_id, draft_id, property_key, valuation_version, snapshot_json, snapshot_hash)
    VALUES (${reportId}, ${draft_id}, ${draft.property_key}, ${draft.valuation_version}, ${draft.snapshot_json}, ${draft.snapshot_hash})
  `;

  await sql`
    UPDATE report_drafts SET consumed_at = NOW() WHERE draft_id = ${draft_id}
  `;

  return { report_id: reportId, alreadyConsumed: false };
}

// ── Internal helpers ────────────────────────────────────────────────

/**
 * Build the snapshot JSON from the full valuation result.
 * This is the immutable payload that gets frozen at purchase time.
 */
function buildReportSnapshot(fullResult) {
  const val = fullResult.valuation || {};

  return {
    engineVersion: fullResult.modelVersion || "1.0.0",
    collectedAt: fullResult.collectedAt || new Date().toISOString(),
    asOfDate: fullResult.asOfDate || new Date().toISOString().slice(0, 10),
    estimate: {
      midpoint: val.midpoint || null,
      low: val.low || null,
      high: val.high || null,
    },
    confidence: val.confidence || null,
    comparables: val.acceptedComparables || fullResult.comparables || [],
    multiSourceAnalysis: val.multiSourceAnalysis || null,
    keyFactors: val.keyFactors || [],
    dataLimitations: val.dataLimitations || [],
    addressVerification: {
      address: fullResult.address,
      suburb: fullResult.suburb,
      state: fullResult.state,
      postcode: fullResult.postcode,
      propertyType: fullResult.propertyType,
      landSize: fullResult.landSize || null,
    },
    customerData: {
      bedrooms: fullResult.bedrooms || null,
      bathrooms: fullResult.bathrooms || null,
      carSpaces: fullResult.carSpaces || null,
    },
    factorAdjustments: val.factorAdjustments || null,
    factorTotal: val.factorTotal || null,
    anchor: val.anchor || null,
    weightedMedian: val.weightedMedian || null,
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
