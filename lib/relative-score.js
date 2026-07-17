export const RELATIVE_SCORE_SCALE = 100;
export const RELATIVE_SCORE_STEP = 5;
export const RELATIVE_SCORE_MAX = 95;

export function roundRelativeScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(
    RELATIVE_SCORE_STEP,
    Math.min(RELATIVE_SCORE_MAX, Math.round(n / RELATIVE_SCORE_STEP) * RELATIVE_SCORE_STEP),
  );
}

export function relativeRating(value) {
  const score = roundRelativeScore(value);
  if (score == null) return "Not rated";
  const ratings = [
    [95, "AAA"], [90, "AA+"], [85, "AA"], [80, "AA-"], [75, "A+"],
    [70, "A"], [65, "A-"], [60, "BBB+"], [55, "BBB"], [50, "BBB-"],
    [45, "BB+"], [40, "BB"], [35, "BB-"], [30, "B+"], [25, "B"],
    [20, "B-"], [15, "CCC+"], [10, "CCC"], [5, "CCC-"],
  ];
  return ratings.find(([threshold]) => score >= threshold)?.[1] || "CCC-";
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
    const score = roundRelativeScore(100 - (averageRank / denominator) * 100);
    for (let i = start; i <= end; i += 1) result[valid[i].index] = score;
    start = end + 1;
  }
  return result;
}

export function relativeTier(score) {
  return relativeRating(score);
}
