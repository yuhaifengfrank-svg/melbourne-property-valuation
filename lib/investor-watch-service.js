import { addressSignature } from "./comparable-research-collector.js";

const ITEM_TYPES = new Set(["suburb", "property"]);
const GOALS = new Set(["balanced", "growth", "income", "school", "value"]);

function text(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function positiveId(value) {
  const raw = String(value ?? "");
  if (!/^[1-9]\d*$/.test(raw)) throw new Error("INVALID_ITEM_ID");
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) throw new Error("INVALID_ITEM_ID");
  return id;
}

export function canonicalizeWatchItem(input = {}) {
  const itemType = text(input.itemType, 20).toLowerCase();
  if (!ITEM_TYPES.has(itemType)) throw new Error("INVALID_ITEM_TYPE");
  const suburb = text(input.suburb, 120).toUpperCase();
  const state = text(input.state || "VIC", 3).toUpperCase();
  const postcode = text(input.postcode, 4);
  const investmentGoal = text(input.investmentGoal || "balanced", 20).toLowerCase();
  const privateNote = text(input.privateNote, 1000) || null;
  if (!suburb) throw new Error("SUBURB_REQUIRED");
  if (!/^[A-Z]{2,3}$/.test(state)) throw new Error("INVALID_STATE");
  if (postcode && !/^\d{4}$/.test(postcode)) throw new Error("INVALID_POSTCODE");
  if (!GOALS.has(investmentGoal)) throw new Error("INVALID_INVESTMENT_GOAL");

  if (itemType === "suburb") {
    return {
      itemType, canonicalItemKey: `suburb|${suburb}|${state}|${postcode}`,
      suburb, state, postcode: postcode || null, propertyKey: null,
      displayAddress: null, investmentGoal, privateNote,
    };
  }

  const displayAddress = text(input.displayAddress || input.address, 300);
  if (!displayAddress) throw new Error("ADDRESS_REQUIRED");
  const signature = addressSignature(displayAddress);
  if (!signature.streetNumber || !signature.streetName) throw new Error("INVALID_ADDRESS");
  const propertyType = text(input.propertyType || "", 30).toLowerCase();
  const streetIdentity = `${signature.unitNumber ? `${signature.unitNumber}/` : ""}${signature.streetNumber} ${signature.streetName}`;
  const propertyKey = `${streetIdentity}|${suburb}|${state}|${postcode}|${propertyType}`;
  return {
    itemType, canonicalItemKey: `property|${propertyKey}`, suburb, state,
    postcode: postcode || null, propertyKey, displayAddress, investmentGoal, privateNote,
  };
}

export async function getWatchStatus(sql, leadContactId) {
  const rows = await sql`
    SELECT m.status, m.suburb_limit, m.property_limit, m.report_limit,
      COUNT(i.id) FILTER (WHERE i.status = 'active' AND i.item_type = 'suburb')::int AS suburbs_used,
      COUNT(i.id) FILTER (WHERE i.status = 'active' AND i.item_type = 'property')::int AS properties_used
    FROM investor_watch_memberships m
    LEFT JOIN investor_watch_items i ON i.lead_contact_id = m.lead_contact_id
    WHERE m.lead_contact_id = ${leadContactId}
    GROUP BY m.id
  `;
  return rows[0] || null;
}

export async function listWatchItems(sql, leadContactId, includeArchived = false) {
  return sql`
    SELECT id, item_type, canonical_item_key, suburb, state, postcode,
           property_key, display_address, investment_goal, private_note,
           status, created_at, updated_at
    FROM investor_watch_items
    WHERE lead_contact_id = ${leadContactId}
      AND (${includeArchived}::boolean OR status = 'active')
    ORDER BY updated_at DESC, id DESC
  `;
}

export async function addWatchItem(sql, leadContactId, input) {
  const item = canonicalizeWatchItem(input);
  const rows = await sql`
    INSERT INTO investor_watch_items (
      lead_contact_id, item_type, canonical_item_key, suburb, state, postcode,
      property_key, display_address, investment_goal, private_note
    )
    SELECT ${leadContactId}, ${item.itemType}, ${item.canonicalItemKey},
           ${item.suburb}, ${item.state}, ${item.postcode}, ${item.propertyKey},
           ${item.displayAddress}, ${item.investmentGoal}, ${item.privateNote}
    FROM investor_watch_memberships m
    WHERE m.lead_contact_id = ${leadContactId}
      AND (
        (${item.itemType} = 'suburb' AND (
          SELECT COUNT(*) FROM investor_watch_items q
          WHERE q.lead_contact_id = ${leadContactId} AND q.item_type = 'suburb' AND q.status = 'active'
        ) < m.suburb_limit)
        OR
        (${item.itemType} = 'property' AND (
          SELECT COUNT(*) FROM investor_watch_items q
          WHERE q.lead_contact_id = ${leadContactId} AND q.item_type = 'property' AND q.status = 'active'
        ) < m.property_limit)
      )
    ON CONFLICT (lead_contact_id, canonical_item_key) WHERE status = 'active'
    DO UPDATE SET investment_goal = EXCLUDED.investment_goal,
                  private_note = EXCLUDED.private_note,
                  updated_at = NOW()
    RETURNING id, item_type, canonical_item_key, suburb, state, postcode,
              property_key, display_address, investment_goal, private_note,
              status, created_at, updated_at
  `;
  if (rows[0]) return rows[0];
  throw new Error("WATCH_LIMIT_REACHED");
}

export async function updateWatchItem(sql, leadContactId, input) {
  const id = positiveId(input.id);
  const investmentGoal = text(input.investmentGoal || "balanced", 20).toLowerCase();
  const privateNote = text(input.privateNote, 1000) || null;
  if (!GOALS.has(investmentGoal)) throw new Error("INVALID_INVESTMENT_GOAL");
  const rows = await sql`
    UPDATE investor_watch_items
    SET investment_goal = ${investmentGoal}, private_note = ${privateNote}, updated_at = NOW()
    WHERE id = ${id} AND lead_contact_id = ${leadContactId}
    RETURNING id, investment_goal, private_note, status, updated_at
  `;
  if (!rows[0]) throw new Error("WATCH_ITEM_NOT_FOUND");
  return rows[0];
}

export async function archiveWatchItem(sql, leadContactId, idValue) {
  const id = positiveId(idValue);
  const rows = await sql`
    UPDATE investor_watch_items SET status = 'archived', updated_at = NOW()
    WHERE id = ${id} AND lead_contact_id = ${leadContactId} AND status = 'active'
    RETURNING id
  `;
  return Boolean(rows[0]);
}
