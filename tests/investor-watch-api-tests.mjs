import test from "node:test";
import assert from "node:assert/strict";
import handler, { setTestSql } from "../api/investor-watch.js";
import { hashOpaqueToken } from "../lib/member-session-service.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function request(method, action, body, cookie = "session-token") {
  return {
    method, body, query: { action },
    headers: cookie ? { cookie: `aushomevalue_member_session=${cookie}` } : {},
  };
}

function memberSql(nextQuery) {
  return async (strings, ...values) => {
    const raw = strings.join("?");
    if (raw.includes("FROM member_sessions")) {
      assert.equal(values[0], hashOpaqueToken("session-token"));
      return [{
        session_id: 1, lead_contact_id: 42, membership_id: 2,
        membership_status: "free", report_limit: 0, reports_used: 0,
      }];
    }
    return nextQuery(raw, values);
  };
}

test("unauthenticated watch request is rejected", async () => {
  setTestSql(async () => []);
  const response = responseRecorder();
  await handler(request("GET", "items", null, ""), response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, "UNAUTHENTICATED");
});

test("items action returns only the session owner's rows", async () => {
  setTestSql(memberSql((raw, values) => {
    assert.match(raw, /FROM investor_watch_items/);
    assert.equal(values[0], 42);
    return [{ id: 8, suburb: "KEW" }];
  }));
  const response = responseRecorder();
  await handler(request("GET", "items"), response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.items, [{ id: 8, suburb: "KEW" }]);
});

test("add ignores a forged leadContactId and uses the session owner", async () => {
  setTestSql(memberSql((raw, values) => {
    assert.match(raw, /INSERT INTO investor_watch_items/);
    assert.equal(values[0], 42);
    assert.equal(values.includes(999), false);
    return [{ id: 10, item_type: "suburb" }];
  }));
  const response = responseRecorder();
  await handler(request("POST", "add", {
    leadContactId: 999, itemType: "suburb", suburb: "Hawthorn", postcode: "3122",
  }), response);
  assert.equal(response.statusCode, 201);
});

test("quota, unknown action and invalid JSON have stable public errors", async () => {
  setTestSql(memberSql(() => []));
  const quota = responseRecorder();
  await handler(request("POST", "add", { itemType: "suburb", suburb: "Kew" }), quota);
  assert.equal(quota.statusCode, 409);
  assert.equal(quota.body.error, "WATCH_LIMIT_REACHED");

  const unknown = responseRecorder();
  await handler(request("GET", "admin"), unknown);
  assert.equal(unknown.statusCode, 404);

  const invalid = responseRecorder();
  await handler(request("POST", "add", "{"), invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.error, "INVALID_JSON");
});
