import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] || "--verify";
if (!new Set(["--verify", "--apply"]).has(mode)) {
  throw new Error("Use --verify or --apply");
}

const connectionString = process.env.PRODUCTION_DATABASE_URL;
if (!connectionString) throw new Error("PRODUCTION_DATABASE_URL is required");
const parsed = new URL(connectionString);
const expectedHost = process.env.INVESTOR_WATCH_PRODUCTION_DB_HOST;
if (!expectedHost) throw new Error("INVESTOR_WATCH_PRODUCTION_DB_HOST is required");
if (parsed.hostname !== expectedHost) {
  throw new Error("Database host does not match the approved Production host");
}
const previewHost = process.env.INVESTOR_WATCH_PREVIEW_DB_HOST;
if (previewHost && parsed.hostname === previewHost) {
  throw new Error("Preview database is forbidden for the Production runner");
}
if (mode === "--apply") {
  if (process.env.ALLOW_IW_PRODUCTION_MIGRATION !== "apply-migration-013") {
    throw new Error("Production migration write permission is missing");
  }
  if (process.env.PRODUCTION_RELEASE_CONFIRMATION !== "investor-watch-v1") {
    throw new Error("Production release confirmation is missing");
  }
}

const expectedTables = [
  "member_login_tokens", "member_sessions", "investor_watch_memberships",
  "investor_watch_items", "investor_watch_score_history",
  "investor_watch_change_events", "investor_watch_notification_preferences",
];
const dependencyTables = ["lead_contacts", "consent_records", "suburb_metrics"];

const { Pool } = pg;
const pool = new Pool({ connectionString, max: 1, ssl: { rejectUnauthorized: false } });

async function inspect(client) {
  const dependencies = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `, [dependencyTables]);
  const presentDependencies = new Set(dependencies.rows.map((row) => row.table_name));
  for (const dependency of dependencyTables) {
    if (!presentDependencies.has(dependency)) throw new Error(`Missing dependency: ${dependency}`);
  }
  const result = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [expectedTables]);
  return result.rows.map((row) => row.table_name);
}

const client = await pool.connect();
try {
  const before = await inspect(client);
  if (mode === "--verify") {
    console.log(JSON.stringify({
      ok: true,
      mode: "verify",
      host: parsed.hostname,
      dependencies: dependencyTables,
      investorWatchTables: before,
    }, null, 2));
  } else {
    const sql = fs.readFileSync(path.join(root, "db/migration-013-investor-watch.sql"), "utf8");
    await client.query(sql);
    const after = await inspect(client);
    if (after.length !== expectedTables.length) {
      throw new Error("Migration verification failed: not all Investor Watch tables exist");
    }
    console.log(JSON.stringify({
      ok: true,
      mode: "apply",
      host: parsed.hostname,
      investorWatchTables: after,
    }, null, 2));
  }
} finally {
  client.release();
  await pool.end();
}
