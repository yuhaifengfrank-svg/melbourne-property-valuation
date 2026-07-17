import assert from "node:assert/strict";
import test from "node:test";

import { percentileScores, relativeRating, roundRelativeScore } from "../lib/relative-score.js";

test("relative scores use 5-point bands and preserve missing data", () => {
  assert.equal(roundRelativeScore(83), 85);
  assert.equal(roundRelativeScore(null), null);
  assert.equal(roundRelativeScore(undefined), null);
});

test("percentile scores spread ordered values and average ties", () => {
  assert.deepEqual(percentileScores([30, 20, 10, null]), [95, 50, 5, null]);
  assert.deepEqual(percentileScores([10, 20, 30], { lowerIsBetter: true }), [95, 50, 5]);
  assert.deepEqual(percentileScores([30, 30, 10]), [75, 75, 5]);
});

test("internal ratings map from AAA to CCC minus", () => {
  assert.equal(relativeRating(100), "AAA");
  assert.equal(relativeRating(95), "AAA");
  assert.equal(relativeRating(85), "AA");
  assert.equal(relativeRating(65), "A-");
  assert.equal(relativeRating(5), "CCC-");
  assert.equal(relativeRating(null), "Not rated");
});
