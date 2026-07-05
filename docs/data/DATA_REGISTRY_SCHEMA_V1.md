# AusHomeValue Data Registry Schema V1

**Status:** Approved for migration drafting only  
**Approved by:** CX-DF-003  
**Database execution:** Not authorised

## Purpose

Provide auditable lineage from a public metric back to its definition, source and ingestion run. This registry does not store raw datasets or calculate scores.

## Tables

### `data_source_registry`

One row per external source or separately governed export.

Required fields:

- `source_key` text primary key
- `display_name` text not null
- `publisher` text not null
- `jurisdiction` text
- `landing_url` text
- `licence_name` text
- `licence_status` text not null: `verified | restricted | unknown`
- `licence_evidence_url` text
- `commercial_reuse_status` text not null: `verified | restricted | blocked | unknown`
- `automated_access_status` text not null: `verified | restricted | blocked | unknown`
- `attribution_text` text
- `terms_notes` text
- `cadence` text
- `primary_grain` text
- `raw_archive_required` boolean not null default true
- `active` boolean not null default true
- `evidence_checked_at` date
- `created_at` and `updated_at` timestamptz not null default now()

Do not place `data_class` on this table. A source may support FACT, DERIVED and MODELLED outputs; classification belongs to each metric.

### `data_ingestion_runs`

One row per attempted retrieval or transformation run.

Required fields:

- `run_id` bigserial primary key
- `source_key` text foreign key to `data_source_registry`
- `status` text not null: `running | succeeded | partial | failed | skipped`
- `source_period_start` and `source_period_end` date
- `retrieved_at`, `run_started_at`, `run_completed_at` timestamptz
- `source_url` text
- `raw_archive_path` text
- `source_checksum_sha256` text
- `parser_version` text
- `rows_read`, `rows_accepted`, `rows_rejected` integer
- `target_environment` text: `none | oracle | preview | production`
- `target_table` text
- `artifact_path` text
- `error_summary` text
- `metadata` jsonb not null default `{}`

No credentials, connection strings or raw exception stacks may be stored.

### `metric_definition_registry`

One row per publishable or internal metric definition.

Required fields:

- `metric_key` text primary key
- `display_name` text not null
- `description` text
- `data_class` text not null: `FACT | DERIVED | MODELLED | SCORE | AI_TEXT`
- `unit` text
- `direction` text: `higher_is_better | lower_is_better | neutral`
- `geography_grain` text
- `property_type_scope` text
- `formula_or_method` text
- `formula_version` text
- `fresh_after_days` integer
- `stale_after_days` integer
- `publishable` boolean not null default false
- `active` boolean not null default true
- `created_at` and `updated_at` timestamptz not null default now()

### `metric_source_dependencies`

Relational join table between metrics and sources. This replaces an unenforced `source_keys TEXT[]` field.

Required fields:

- `metric_key` text foreign key to `metric_definition_registry`
- `source_key` text foreign key to `data_source_registry`
- `dependency_role` text not null: `primary | supporting | calibration | fallback`
- `required` boolean not null default true
- `fallback_level` integer
- primary key (`metric_key`, `source_key`, `dependency_role`)

## Constraints

- Use database `CHECK` constraints for every enum above.
- Reject negative row counts and invalid source periods.
- Use `ON DELETE RESTRICT` on registry foreign keys.
- Make migration reruns safe with `IF NOT EXISTS` where appropriate.
- Add indexes for ingestion lookup by `(source_key, run_started_at desc)` and status.

## Storage Boundary

- Oracle: raw files, large history, geospatial intermediates and replayable archives.
- Neon: these compact registry tables plus canonical serving artifacts.
- Repository: reviewed seed JSON, metric definitions, checksums and migration files.

## Authorised Next Artifact

OpenClaw may draft:

1. One migration containing these four tables and constraints.
2. A reviewed JSON seed containing the corrected source records from OC-DF-001-R2.
3. Static tests for schema fields, enum values, source-key uniqueness and idempotent seed generation.

OpenClaw must not execute the migration, connect to a writable database, deploy, or modify application runtime code.

## Context-Safe Delivery

OC-DF-002 must maintain `_orch/handoffs/OC-DF-002/STATE.json` and `PROGRESS.md` from the start of work. Each completed stage must record its files, validation commands, results, current commit and exact resume command. At 65% context usage, checkpoint and end the current session; at 70%, stop without beginning new work.
