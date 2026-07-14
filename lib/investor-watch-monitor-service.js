import { scoreFutureOpportunity } from "./future-opportunity-outlook.js";

export const SCORE_CHANGE_THRESHOLD = 3;

export function classifyScoreChange(previousScore, currentScore, modelChanged = false) {
  if (modelChanged) return null;
  const previous = Number(previousScore);
  const current = Number(currentScore);
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
  const delta = Math.round((current - previous) * 100) / 100;
  if (Math.abs(delta) < SCORE_CHANGE_THRESHOLD) return null;
  return { eventType: delta > 0 ? "score_up" : "score_down", delta };
}

export async function captureSuburbWatchScores(sql, options = {}) {
  const score = options.score || scoreFutureOpportunity;
  const candidates = await sql`
    SELECT i.id AS watch_item_id, i.investment_goal, i.suburb, i.state,
           sm.median_house_price, sm.median_unit_price, sm.gross_yield,
           sm.school_score, sm.vacancy_rate, sm.supply_constraint_score,
           sm.infrastructure_score, sm.overall_confidence, sm.updated_at
    FROM investor_watch_items i
    JOIN suburb_metrics sm ON LOWER(sm.suburb) = LOWER(i.suburb) AND sm.state = i.state
    WHERE i.status = 'active' AND i.item_type = 'suburb'
  `;
  const summary = { candidates: candidates.length, captured: 0, events: 0 };
  for (const row of candidates) {
    const previousRows = await sql`
      SELECT future_opportunity_score, model_version
      FROM investor_watch_score_history
      WHERE watch_item_id = ${row.watch_item_id}
      ORDER BY captured_at DESC, id DESC LIMIT 1
    `;
    const outlook = score(row, { strategy: row.investment_goal || "balanced", propertyType: "either" });
    const dataAsOf = row.updated_at ? new Date(row.updated_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const inserted = await sql`
      INSERT INTO investor_watch_score_history (
        watch_item_id, future_opportunity_score, confidence_score,
        component_scores, model_version, data_as_of
      ) VALUES (
        ${row.watch_item_id}, ${outlook.futureOpportunityIndex}, ${outlook.confidenceScore},
        ${JSON.stringify(outlook.componentScores)}::jsonb, ${outlook.modelVersion}, ${dataAsOf}
      )
      ON CONFLICT (watch_item_id, model_version, data_as_of) DO NOTHING
      RETURNING id
    `;
    if (!inserted[0]) continue;
    summary.captured += 1;
    const previous = previousRows[0];
    const change = classifyScoreChange(
      previous?.future_opportunity_score,
      outlook.futureOpportunityIndex,
      Boolean(previous && previous.model_version !== outlook.modelVersion)
    );
    if (!change) continue;
    const eventKey = `${row.watch_item_id}|${outlook.modelVersion}|${dataAsOf}|${change.eventType}`;
    const eventRows = await sql`
      INSERT INTO investor_watch_change_events (
        watch_item_id, event_type, event_key, previous_value, current_value, source_data_as_of
      ) VALUES (
        ${row.watch_item_id}, ${change.eventType}, ${eventKey},
        ${JSON.stringify({ score: Number(previous.future_opportunity_score) })}::jsonb,
        ${JSON.stringify({ score: outlook.futureOpportunityIndex, delta: change.delta })}::jsonb,
        ${dataAsOf}
      )
      ON CONFLICT (event_key) DO NOTHING RETURNING id
    `;
    if (eventRows[0]) summary.events += 1;
  }
  return summary;
}
