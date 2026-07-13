import test from "node:test";
import assert from "node:assert/strict";
import {
  addWatchItem,
  archiveWatchItem,
  canonicalizeWatchItem,
  listWatchItems,
  updateWatchItem,
} from "../lib/investor-watch-service.js";

test("suburb identity is canonical and client keys are ignored", () => {
  const item = canonicalizeWatchItem({
    itemType: "suburb", suburb: " oakleigh south ", state: "vic", postcode: "3167",
    canonicalItemKey: "forged", investmentGoal: "growth",
  });
  assert.equal(item.canonicalItemKey, "suburb|OAKLEIGH SOUTH|VIC|3167");
  assert.equal(item.investmentGoal, "growth");
  assert.equal(item.propertyKey, null);
});

test("property identity reuses the existing address signature normalisation", () => {
  const a = canonicalizeWatchItem({
    itemType: "property", address: "Unit 1, 10 Smith St, Oakleigh VIC 3166",
    suburb: "Oakleigh", state: "VIC", postcode: "3166", propertyType: "Unit",
  });
  const b = canonicalizeWatchItem({
    itemType: "property", address: "1/10 Smith Street, Oakleigh VIC 3166",
    suburb: "Oakleigh", state: "VIC", postcode: "3166", propertyType: "Unit",
  });
  assert.equal(a.canonicalItemKey, b.canonicalItemKey);
  assert.match(a.propertyKey, /OAKLEIGH\|VIC\|3166\|unit$/);
});

test("malformed items and unsupported goals fail closed", () => {
  assert.throws(() => canonicalizeWatchItem({ itemType: "suburb" }), /SUBURB_REQUIRED/);
  assert.throws(() => canonicalizeWatchItem({ itemType: "property", suburb: "Kew", address: "Kew" }), /INVALID_ADDRESS/);
  assert.throws(() => canonicalizeWatchItem({ itemType: "suburb", suburb: "Kew", investmentGoal: "crypto" }), /INVALID_INVESTMENT_GOAL/);
});

test("add enforces membership quota in the insert statement", async () => {
  const sql = async (strings, ...values) => {
    const raw = strings.join("?");
    assert.match(raw, /FROM investor_watch_memberships/);
    assert.match(raw, /m\.suburb_limit/);
    assert.match(raw, /ON CONFLICT \(lead_contact_id, canonical_item_key\) WHERE status = 'active'/);
    assert.equal(values[0], 42);
    return [{ id: 7, item_type: "suburb" }];
  };
  const result = await addWatchItem(sql, 42, { itemType: "suburb", suburb: "Kew", postcode: "3101" });
  assert.equal(result.id, 7);
});

test("quota rejection is explicit", async () => {
  const sql = async () => [];
  await assert.rejects(
    addWatchItem(sql, 42, { itemType: "suburb", suburb: "Kew", postcode: "3101" }),
    /WATCH_LIMIT_REACHED/
  );
});

test("list, update and archive always scope by authenticated contact", async () => {
  const seen = [];
  const sql = async (strings, ...values) => {
    seen.push({ raw: strings.join("?"), values });
    return [{ id: 9 }];
  };
  await listWatchItems(sql, 42);
  await updateWatchItem(sql, 42, { id: 9, investmentGoal: "value", privateNote: "Review" });
  assert.equal(await archiveWatchItem(sql, 42, 9), true);
  for (const query of seen) {
    assert.match(query.raw, /lead_contact_id/);
    assert.ok(query.values.includes(42));
  }
});
