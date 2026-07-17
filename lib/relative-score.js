export const RELATIVE_SCORE_SCALE = 100;
export const RELATIVE_SCORE_STEP = 1;
export const RELATIVE_SCORE_MAX = 95;
export const RELATIVE_SCORE_TOP_DETAIL_RANKS = 20;

export function roundRelativeScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(
    RELATIVE_SCORE_STEP,
    Math.min(RELATIVE_SCORE_MAX, Math.round(n / RELATIVE_SCORE_STEP) * RELATIVE_SCORE_STEP),
  );
}

export function percentileScores(values, { lowerIsBetter = false } = {}) {
  const valid = values
    .map((value, index) => ({
      index,
      value: value === null || value === undefined || value === "" ? NaN : Number(value),
    }))
    .filter(({ value }) => Number.isFinite(value));
  const result = Array(values.length).fill(null);
  if (valid.length === 0) return result;

  valid.sort((a, b) => lowerIsBetter ? a.value - b.value : b.value - a.value);
  const denominator = Math.max(valid.length - 1, 1);
  for (let start = 0; start < valid.length;) {
    let end = start;
    while (end + 1 < valid.length && valid[end + 1].value === valid[start].value) end += 1;
    const averageRank = (start + end) / 2;
    // Large statewide populations need extra resolution at the top: otherwise
    // several leading suburbs round to the same 95/100. Keep the first 20
    // ranks one point apart, then distribute the remaining ranks down to 1.
    const useTopDetail = valid.length > RELATIVE_SCORE_MAX;
    const topDetailEnd = Math.min(RELATIVE_SCORE_TOP_DETAIL_RANKS, denominator);
    const score = useTopDetail && averageRank <= topDetailEnd
      ? Math.round(RELATIVE_SCORE_MAX - averageRank)
      : useTopDetail
        ? Math.round(
          (RELATIVE_SCORE_MAX - topDetailEnd)
          - ((averageRank - topDetailEnd) / Math.max(denominator - topDetailEnd, 1))
            * (RELATIVE_SCORE_MAX - topDetailEnd - 1),
        )
        : Math.round(RELATIVE_SCORE_MAX - (averageRank / denominator) * (RELATIVE_SCORE_MAX - 1));
    for (let i = start; i <= end; i += 1) result[valid[i].index] = score;
    start = end + 1;
  }
  return result;
}
