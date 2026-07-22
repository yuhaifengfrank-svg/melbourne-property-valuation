import test from "node:test";
import assert from "node:assert/strict";
import { auditCoverage } from "../scripts/audit-suburb-market-coverage.mjs";

test("coverage audit creates 3br, 4br and vacancy research for every suburb", () => {
  const result = auditCoverage([{ suburb_name: "A" }, { suburb_name: "B" }, { suburb_name: "A" }]);
  assert.equal(result.suburbCount, 2);
  assert.equal(result.requiredMetricCount, 6);
  assert.deepEqual(new Set(result.tasks.map((t) => t.metric)), new Set(["house_rent_3br", "house_rent_4br", "rental_vacancy"]));
  assert.ok(result.tasks.every((t) => t.costConstraint === "free"));
});
