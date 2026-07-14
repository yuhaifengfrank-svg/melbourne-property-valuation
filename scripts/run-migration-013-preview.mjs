import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] || "--verify";
const allowedModes = new Set(["--verify", "--apply", "--rollback"]);
if (!allowedModes.has(mode)) throw new Error("Use --verify, --apply or --rollback");

const connectionString = process.env.PREVIEW_DATABASE_URL;
if (!connectionString) throw new Error("PREVIEW_DATABASE_URL is required");
const parsed = new URL(connectionString);
const expectedHost = process.env.INVESTOR_WATCH_PREVIEW_DB_HOST;
if (!expectedHost) throw new Error("INVESTOR_WATCH_PREVIEW_DB_HOST is required");
if (parsed.hostname !== expectedHost) throw new Error("Database host does not match the approved Preview host");

const productionHint = "ep-winter-band-a7qym6bq-pooler.ap-southeast-2";
if (parsed.hostname === productionHint) throw new Error("Production database is forbidden");
if (mode !== "--verify" && process.env.ALLOW_IW_PREVIEW_MIGRATION !== "yes") {
  throw new Error("Set ALLOW_IW_PREVIEW_MIGRATION=yes for Preview writes");
}

const { Pool } = pg;
const pool = new Pool({ connectionString, max: 1, ssl: { rejectUnauthorized: false } });
const expectedTables = [
  "member_login_tokens", "member_sessions", "investor_watch_memberships",
  "investor_watch_items", "investor_watch_score_history",
  "investor_watch_change_events", "investor_watch_notification_preferences",
];
const dependencyTables = [
  "lead_contacts", "consent_records", "membership_report_usage", "suburb_metrics",
];

async function verify(client) {
  const dependencies = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `, [dependencyTables]);
  const present = new Set(dependencies.rows.map((row) => row.table_name));
  for (const dependency of dependencyTables) {
    if (!present.has(dependency)) throw new Error(`Missing dependency: ${dependency}`);
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
  const before = await verify(client);
  if (mode === "--verify") {
    console.log(JSON.stringify({ ok: true, mode: "verify", host: parsed.hostname, investorWatchTables: before }, null, 2));
  } else {
    const filename = mode === "--apply"
      ? "migration-013-investor-watch.sql"
      : "rollback-013-investor-watch.sql";
    const sql = fs.readFileSync(path.join(root, "db", filename), "utf8");
    await client.query(sql);
    const after = await verify(client);
    if (mode === "--apply" && after.length !== expectedTables.length) {
      throw new Error("Migration verification failed: not all Investor Watch tables exist");
    }
    if (mode === "--rollback" && after.length !== 0) {
      throw new Error("Rollback verification failed: Investor Watch tables remain");
    }
    console.log(JSON.stringify({ ok: true, mode: mode.slice(2), host: parsed.hostname, investorWatchTables: after }, null, 2));
  }
} finally {
  client.release();
  await pool.end();
}
