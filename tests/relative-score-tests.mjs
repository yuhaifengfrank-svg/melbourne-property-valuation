import assert from "node:assert/strict";
import test from "node:test";

import { percentileScores, roundRelativeScore } from "../lib/relative-score.js";

test("relative scores use integer points and preserve missing data", () => {
  assert.equal(roundRelativeScore(83.4), 83);
  assert.equal(roundRelativeScore(null), null);
  assert.equal(roundRelativeScore(undefined), null);
});

test("large relative rankings preserve one-point detail across the leading ranks", () => {
  const values = Array.from({ length: 1000 }, (_, index) => 1000 - index);
  const scores = percentileScores(values);
  assert.deepEqual(scores.slice(0, 5), [95, 94, 93, 92, 91]);
  assert.equal(scores[20], 75);
  assert.equal(scores[999], 1);
});

test("percentile scores spread ordered values and average ties", () => {
  assert.deepEqual(percentileScores([30, 20, 10, null]), [95, 48, 1, null]);
  assert.deepEqual(percentileScores([10, 20, 30], { lowerIsBetter: true }), [95, 48, 1]);
  assert.deepEqual(percentileScores([30, 30, 10]), [72, 72, 1]);
});
