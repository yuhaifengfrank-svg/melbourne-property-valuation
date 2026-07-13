import test from "node:test";
import assert from "node:assert/strict";
import { captureSuburbWatchScores, classifyScoreChange } from "../lib/investor-watch-monitor-service.js";

test("score changes below three points do not create noise", () => {
  assert.equal(classifyScoreChange(60, 62.9), null);
  assert.deepEqual(classifyScoreChange(60, 63), { eventType: "score_up", delta: 3 });
  assert.deepEqual(classifyScoreChange(60, 54), { eventType: "score_down", delta: -6 });
});

test("model-version changes are not misreported as market changes", () => {
  assert.equal(classifyScoreChange(50, 80, true), null);
});

test("capture creates one versioned snapshot and deduplicated material event", async () => {
  const queries = [];
  const sql = async (strings, ...values) => {
    const raw = strings.join("?"); queries.push(raw);
    if (raw.includes("JOIN suburb_metrics")) return [{ watch_item_id: 9, investment_goal: "growth", suburb: "KEW", state: "VIC", updated_at: "2026-07-13", median_house_price: 1200000 }];
    if (raw.includes("SELECT future_opportunity_score, model_version")) return [{ future_opportunity_score: 60, model_version: "future_outlook_v1" }];
    if (raw.includes("INSERT INTO investor_watch_score_history")) { assert.equal(values[0], 9); assert.equal(values[1], 66); return [{ id: 100 }]; }
    if (raw.includes("INSERT INTO investor_watch_change_events")) { assert.equal(values[1], "score_up"); assert.match(values[2], /9\|future_outlook_v1\|2026-07-13\|score_up/); return [{ id: 101 }]; }
    throw new Error(`Unexpected SQL: ${raw.slice(0, 100)}`);
  };
  const summary = await captureSuburbWatchScores(sql, { score: () => ({ futureOpportunityIndex: 66, confidenceScore: 72, componentScores: { demand: 70 }, modelVersion: "future_outlook_v1" }) });
  assert.deepEqual(summary, { candidates: 1, captured: 1, events: 1 });
  assert.ok(queries.some((query) => query.includes("ON CONFLICT (event_key) DO NOTHING")));
});

test("already captured data produces no duplicate event", async () => {
  const sql = async (strings) => {
    const raw = strings.join("?");
    if (raw.includes("JOIN suburb_metrics")) return [{ watch_item_id: 1, updated_at: "2026-07-13" }];
    if (raw.includes("SELECT future_opportunity_score")) return [];
    if (raw.includes("INSERT INTO investor_watch_score_history")) return [];
    throw new Error("change event must not be attempted");
  };
  const summary = await captureSuburbWatchScores(sql, { score: () => ({ futureOpportunityIndex: 50, confidenceScore: 50, componentScores: {}, modelVersion: "v1" }) });
  assert.deepEqual(summary, { candidates: 1, captured: 0, events: 0 });
});
