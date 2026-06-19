/**
 * data-source-registry.js
 *
 * Pure read/metadata service for the data_source_registry table.
 *
 * No network calls. No .env reads. No credentials exposed in logs.
 */

const SOURCE_KEY_RE = /^[a-z0-9._-]+$/;

const ALLOWED_TYPES = ["gis", "macro", "census", "sales", "school", "planning"];

/**
 * Validate a source_key format.
 * @param {string} key
 * @returns {boolean}
 */
function isValidSourceKey(key) {
  return typeof key === "string" && SOURCE_KEY_RE.test(key);
}

/**
 * Validate a source_type.
 * @param {string} type
 * @returns {boolean}
 */
function isValidSourceType(type) {
  return ALLOWED_TYPES.includes(type);
}

/**
 * Upsert a data source registry entry.
 * @param {object} entry
 * @param {function} sql - Neon tagged-template SQL client
 * @returns {Promise<object>} the inserted/updated row
 */
export async function upsertDataSourceRegistry(entry, sql) {
  if (!entry || !entry.source_key) {
    throw new Error("data-source-registry: source_key is required");
  }
  if (!isValidSourceKey(entry.source_key)) {
    throw new Error(
      `data-source-registry: invalid source_key. Must match ${SOURCE_KEY_RE}`
    );
  }
  if (!isValidSourceType(entry.source_type)) {
    throw new Error(
      `data-source-registry: invalid source_type. Must be one of: ${ALLOWED_TYPES.join(", ")}`
    );
  }

  const now = new Date().toISOString();
  const rows = await sql`
    INSERT INTO data_source_registry (
      source_key, source_name, source_type,
      source_url, source_version, downloaded_at, processed_at,
      file_hash, storage_location, coverage_area, row_count, notes,
      updated_at
    ) VALUES (
      ${entry.source_key},
      ${entry.source_name || entry.source_key},
      ${entry.source_type},
      ${entry.source_url || null},
      ${entry.source_version || null},
      ${entry.downloaded_at || null},
      ${entry.processed_at || null},
      ${entry.file_hash || null},
      ${entry.storage_location || null},
      ${entry.coverage_area || null},
      ${entry.row_count ?? null},
      ${entry.notes || null},
      ${now}
    )
    ON CONFLICT (source_key)
    DO UPDATE SET
      source_name       = COALESCE(EXCLUDED.source_name, data_source_registry.source_name),
      source_type       = COALESCE(EXCLUDED.source_type, data_source_registry.source_type),
      source_url        = COALESCE(EXCLUDED.source_url, data_source_registry.source_url),
      source_version    = COALESCE(EXCLUDED.source_version, data_source_registry.source_version),
      downloaded_at     = COALESCE(EXCLUDED.downloaded_at, data_source_registry.downloaded_at),
      processed_at      = COALESCE(EXCLUDED.processed_at, data_source_registry.processed_at),
      file_hash         = COALESCE(EXCLUDED.file_hash, data_source_registry.file_hash),
      storage_location  = COALESCE(EXCLUDED.storage_location, data_source_registry.storage_location),
      coverage_area     = COALESCE(EXCLUDED.coverage_area, data_source_registry.coverage_area),
      row_count         = COALESCE(EXCLUDED.row_count, data_source_registry.row_count),
      notes             = COALESCE(EXCLUDED.notes, data_source_registry.notes),
      updated_at        = ${now}
    RETURNING *
  `;

  return rows[0] || null;
}

/**
 * Get a single data source registry entry.
 * @param {string} sourceKey
 * @param {function} sql
 * @returns {Promise<object|null>}
 */
export async function getDataSourceRegistry(sourceKey, sql) {
  if (!sourceKey) {
    throw new Error("data-source-registry: sourceKey is required");
  }
  const rows = await sql`
    SELECT * FROM data_source_registry WHERE source_key = ${sourceKey}
  `;
  return rows[0] || null;
}

/**
 * List all data source registry entries.
 * @param {function} sql
 * @returns {Promise<Array<object>>}
 */
export async function listDataSourceRegistry(sql) {
  const rows = await sql`
    SELECT * FROM data_source_registry ORDER BY source_key
  `;
  return rows;
}

export { isValidSourceKey, isValidSourceType, ALLOWED_TYPES };
