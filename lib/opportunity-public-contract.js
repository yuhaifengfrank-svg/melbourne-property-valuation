/** Canonical public presentation contract for suburb opportunity scores. */
import { roundRelativeScore } from "./relative-score.js";
export const OPPORTUNITY_PUBLIC_SCORE_NAME = "Future Opportunity Index";
export const OPPORTUNITY_PUBLIC_SCALE = 100;

export function buildOpportunityPublicScore(outlook = {}) {
  const hasValue = outlook.futureOpportunityIndex !== null
    && outlook.futureOpportunityIndex !== undefined
    && outlook.futureOpportunityIndex !== "";
  const rawValue = hasValue ? Number(outlook.futureOpportunityIndex) : NaN;
  const value = Number.isFinite(rawValue)
    ? roundRelativeScore(rawValue)
    : null;

  return Object.freeze({
    name: OPPORTUNITY_PUBLIC_SCORE_NAME,
    value,
    scale: OPPORTUNITY_PUBLIC_SCALE,
    display: value == null ? "Data unavailable" : `${value}/${OPPORTUNITY_PUBLIC_SCALE}`,
    band: String(outlook.band || "Limited data confidence"),
    type: String(outlook.opportunityType || "Watchlist Opportunity"),
    modelVersion: String(outlook.modelVersion || "future_outlook_v2"),
    horizon: String(outlook.forecastHorizon || "3-5 years"),
    isPriceForecast: false,
  });
}
