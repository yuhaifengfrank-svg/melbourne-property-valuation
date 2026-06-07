// ── 数据库 Schema 管理 ──
// 用于定期抓取的 comparable sales 数据存储
// 不修改 _db.js（leads 表仍在 leads.js 管理）

import { getSql } from "../api/_db.js";

let initialized = false;

export async function ensureComparableSchema(sql) {
  if (initialized) return;
  if (!sql) sql = getSql();

  // 各 SA2 成交记录（每日更新）
  await sql`
    CREATE TABLE IF NOT EXISTS comparable_sales (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sale_address TEXT NOT NULL,
      sale_price BIGINT,
      sale_date DATE,
      property_type TEXT,
      bedrooms INTEGER,
      bathrooms INTEGER,
      car_spaces INTEGER,
      land_size_sqm INTEGER,
      building_area_sqm INTEGER,
      suburb TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'VIC',
      postcode TEXT,
      sa2_code TEXT,
      sa2_name TEXT,
      source_url TEXT NOT NULL,
      source_name TEXT NOT NULL,       -- 'realestate.com.au' | 'domain.com.au' | 'property.com.au'
      raw_price_text TEXT,              -- 原始价格文本，未解析时保留
      collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
      collection_round TEXT             -- 'daily' | 'weekly'
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS cs_sa2_date_idx ON comparable_sales (sa2_code, collection_date DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS cs_suburb_idx ON comparable_sales (suburb, state, sale_date DESC NULLS LAST)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS cs_address_dedup ON comparable_sales (sale_address, source_name)
  `;

  // 各 SA2 每日汇总快照
  await sql`
    CREATE TABLE IF NOT EXISTS suburb_snapshots (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      snapshot_date DATE NOT NULL,
      sa2_code TEXT NOT NULL,
      sa2_name TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'VIC',
      suburb TEXT,
      record_count INTEGER NOT NULL DEFAULT 0,
      median_price BIGINT,
      mean_price BIGINT,
      min_price BIGINT,
      max_price BIGINT,
      median_land_size INTEGER,
      avg_bedrooms NUMERIC(4,2),
      top_sources TEXT[],
      collection_round TEXT DEFAULT 'daily'
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ss_sa2_date_uniq ON suburb_snapshots (sa2_code, snapshot_date)
  `;

  // 维州 TOP 100 SA2 列表
  await sql`
    CREATE TABLE IF NOT EXISTS tracked_suburbs (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sa2_code TEXT NOT NULL UNIQUE,
      sa2_name TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'VIC',
      suburb TEXT,
      priority TEXT NOT NULL DEFAULT 'weekly',  -- 'daily' | 'weekly'
      population_rank INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `;

  initialized = true;
}
