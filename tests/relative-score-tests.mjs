import assert from "node:assert/strict";
import test from "node:test";

import { percentileScores, roundRelativeScore } from "../lib/relative-score.js";

test("relative scores use integer points and preserve missing data", () => {
  assert.equal(roundRelativeScore(83.4), 83);
  assert.equal(roundRelativeScore(null), null);
  assert.equal(roundRelativeScore(undefined), null);
});

test("percentile scores spread ordered values and average ties", () => {
  assert.deepEqual(percentileScores([30, 20, 10, null]), [95, 48, 1, null]);
  assert.deepEqual(percentileScores([10, 20, 30], { lowerIsBetter: true }), [95, 48, 1]);
  assert.deepEqual(percentileScores([30, 30, 10]), [72, 72, 1]);
});
