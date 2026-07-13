import test from "node:test";
import assert from "node:assert/strict";
import { assertDatabaseEnvironment } from "../api/_db.js";

const previewUrl = "postgresql://user:secret@preview-db.example/neondb";

test("Preview database access requires an explicit approved hostname", () => {
  assert.throws(
    () => assertDatabaseEnvironment({ VERCEL_ENV: "preview", DATABASE_URL: previewUrl }),
    /PREVIEW_DATABASE_HOST/
  );
});

test("Preview database access rejects a different hostname", () => {
  assert.throws(
    () => assertDatabaseEnvironment({
      VERCEL_ENV: "preview",
      DATABASE_URL: "postgresql://user:secret@production-db.example/neondb",
      PREVIEW_DATABASE_HOST: "preview-db.example",
    }),
    /not approved/
  );
});

test("Preview database access accepts only an exact hostname match", () => {
  assert.equal(assertDatabaseEnvironment({
    VERCEL_ENV: "preview",
    DATABASE_URL: previewUrl,
    PREVIEW_DATABASE_HOST: "preview-db.example",
  }), previewUrl);
});

test("Production behavior remains unchanged and still requires DATABASE_URL", () => {
  assert.equal(assertDatabaseEnvironment({
    VERCEL_ENV: "production",
    DATABASE_URL: "postgresql://user:secret@production-db.example/neondb",
  }), "postgresql://user:secret@production-db.example/neondb");
  assert.throws(() => assertDatabaseEnvironment({ VERCEL_ENV: "production" }), /DATABASE_URL/);
});
