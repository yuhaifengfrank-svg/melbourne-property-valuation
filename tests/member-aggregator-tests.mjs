import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/member.js";

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

test("unknown member action fails closed", async () => {
  const response = responseRecorder();
  await handler({ method: "GET", query: { action: "admin" } }, response);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { ok: false, error: "NOT_FOUND" });
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("missing member action fails closed", async () => {
  const response = responseRecorder();
  await handler({ method: "GET", query: {} }, response);
  assert.equal(response.statusCode, 404);
});
