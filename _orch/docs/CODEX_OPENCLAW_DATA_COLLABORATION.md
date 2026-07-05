# Codex + OpenClaw Data Collaboration Protocol

**Project:** AusHomeValue  
**Effective:** 2026-06-30  
**Scope:** Free-data foundation, Council planning ingestion, scoring inputs and AI Summary evidence  
**Primary contract:** `docs/data/SUBURB_INTELLIGENCE_DATA_CONTRACT_V2.md`

## 1. Purpose

Split long-running data work between OpenClaw and Codex without depending on either model's chat
history. Repository evidence, Git state and verified external systems are the source of truth.

## 2. Ownership

### OpenClaw owns

- Long-running source discovery and source-access verification.
- Manual or automated free-file acquisition.
- Oracle raw-data storage, ingestion and transformation jobs.
- Council-by-council connector research and extraction.
- Coverage reports, rejected-row reports and freshness reports.
- Updating `_orch/docs/HANDOVER.md`, `_orch/docs/PROJECT_STATUS.md`,
  `_orch/docs/NEXT_ACTION.md` and daily memory at every checkpoint.

### Codex owns

- Canonical Fact / Derived / Model / Score / AI contracts.
- Schema and migration review before execution.
- Formula, factor, confidence and model design.
- API, frontend and AI Summary implementation.
- Data-quality review, regression tests, security review and release recommendation.
- Independent review of OpenClaw deliverables before Preview or Production writes.

### User owns

- Product priorities and acceptance of material methodology changes.
- Approval for Production database writes, deployment, destructive cleanup and paid services.

## 3. Work Isolation

- Do not let both agents edit the same files in the same dirty worktree.
- OpenClaw data tasks use a dedicated verified worktree and a branch named
  `openclaw/data-<task-id>` when implementation begins.
- Codex implementation/review tasks use a dedicated worktree and a `codex/<task-id>` branch.
- Documentation-only coordination may be written to this shared protocol, but each agent must
  re-check `git status` before and after editing.
- Never deploy from the current shared dirty `deploy/oracle-artifacts` worktree.

## 4. Task Packet

Every delegated task must contain:

```text
Task ID
Objective
Approved scope
Source URLs and licence/terms status
Input files/tables
Expected outputs
Oracle/Neon placement
Data grain and business key
Required quality checks
Forbidden actions
Completion evidence
Handover files to update
Single next action
```

One agent may have only one active write task at a time. Research tasks may run in parallel only
when they do not modify shared files or external systems.

## 5. Delivery Gates

### Gate A - Source accepted

- Source is free to access.
- Public/commercial reuse terms have been checked and recorded.
- Geography, cadence, fields and history are known.
- Personal information and prohibited document use are excluded.

### Gate B - Raw ingestion accepted

- Raw file is immutable and date-versioned on Oracle.
- Checksum, source URL, retrieved time and source period are recorded.
- Row count, schema and parser errors are reported.
- No raw bulk GIS, GTFS, Council documents or full register mirror is written to Neon.

### Gate C - Canonical fact accepted

- Business key is unique at the declared grain.
- Geography and address matching coverage is measured.
- Facts retain source, period, unit, data class and fallback level.
- Missing values remain null.

### Gate D - Derived/model accepted

- Formula/model version and inputs are inspectable.
- Distribution, missingness and outlier checks pass.
- Proxy metrics are labelled as proxies.
- Back-test and confidence behaviour are reviewed by Codex.

### Gate E - Publish accepted

- Preview migration and API tests pass.
- AI Summary uses only approved evidence IDs.
- Production write/deployment has explicit user approval.
- Rollback point and post-deploy verification are recorded.

## 6. Storage Responsibilities

### Oracle

- Raw downloads and historical versions.
- Council application/status snapshots.
- Address/parcel/GIS and GTFS source data.
- PostGIS working tables, Parquet exports and model training datasets.
- Rejected rows and transformation logs.

### Neon

- Data-source and metric-definition registries.
- Canonical current suburb facts.
- Compact quarterly/annual history.
- Versioned scores, confidence and evidence packages.
- Bounded nearby-planning and address-result caches.
- Customer and commercial records.

Production Neon operating target: below 250 MiB. Current verified size on 2026-06-30 is about
98.7 MiB.

## 7. Context and Checkpoint Rules

- OpenClaw follows `_orch/docs/OPENCLAW_CONTEXT_CONTINUITY_PROTOCOL.md`.
- Write a checkpoint at 65% context usage.
- Stop starting new work at 70%; complete the current atomic step and hand over.
- Tool output belongs in reports or logs, not in chat history alone.
- A new session starts by verifying Git, handover files and live external state.

## 7A. Codex Unavailable Mode

Codex context, usage allowance or session availability must not become a pipeline dependency.
When Codex is unavailable, OpenClaw may continue only through tasks explicitly marked
`auto_continue: yes` in `_orch/docs/AGENT_TASK_QUEUE.md`.

### OpenClaw may continue autonomously

- Research and verify free public sources.
- Download immutable source files to the approved Oracle raw path.
- Compute checksums and inspect schemas.
- Build parsers and transformations in its isolated worktree.
- Run local/Oracle dry-runs and non-destructive tests.
- Produce artifacts, coverage reports and rejected-row reports.
- Commit completed atomic work to its own branch.
- Start the next queued OpenClaw task only when the current task passes its declared gates.

### OpenClaw must stop and wait

- Production or Preview database writes not explicitly pre-approved in the task packet.
- Schema/migration execution.
- Changes to canonical metric names, formulas, scoring weights or confidence rules.
- API, frontend, payment, authentication or entitlement changes.
- Production/Preview deployment, merge or branch deletion.
- Any source with unclear licence, terms, privacy or automated-access permission.
- Any task that encounters data loss risk, material mismatch, failed acceptance tests or a dirty-file
  ownership conflict.
- Any task whose next queue entry is not marked `auto_continue: yes`.

Stopping is not failure. OpenClaw writes a `BLOCKED` handoff containing the exact evidence needed
for Codex or the user to decide.

## 7B. Durable Handoff Bundle

Every completed or blocked task writes:

```text
_orch/handoffs/<task-id>/
  SUMMARY.md          objective, outcome, decisions and limitations
  STATE.json          machine-readable status and pointers
  FILES.md            created/changed files and ownership
  QA.md               commands, counts, pass/fail and rejected rows
  DATA_LINEAGE.md     source URL, terms, checksum, period and transformations
  NEXT.md             next safe action and stop conditions
```

`STATE.json` minimum shape:

```json
{
  "task_id": "OC-CP-001",
  "status": "completed",
  "completed_at": "2026-06-30T18:00:00+10:00",
  "agent": "OpenClaw",
  "worktree": "/absolute/path",
  "branch": "openclaw/data-oc-cp-001",
  "base_commit": "abcdef0",
  "head_commit": "1234567",
  "pushed": false,
  "database_environment": "none",
  "production_changed": false,
  "artifacts": [],
  "tests": { "passed": 0, "failed": 0 },
  "next_task_id": "CX-CP-001",
  "requires_codex_review": true
}
```

Never put credentials, connection strings, cookies, personal information or raw applicant details
in a handoff bundle.

## 7C. Activity Ledger

OpenClaw appends one concise record to `_orch/docs/AGENT_ACTIVITY_LOG.md` after every task state
change. Do not rewrite previous records.

Each record contains task ID, timestamp, status, branch/commit, database environment, artifact
paths, test result, handoff directory and next action. This ledger lets Codex find all work completed
during an unavailable period without reading every daily memory file.

## 7D. Codex Recovery Procedure

When Codex becomes available again, it must:

1. Read this protocol and the context continuity protocol.
2. Read `AGENT_TASK_QUEUE.md` and the new entries in `AGENT_ACTIVITY_LOG.md`.
3. Read each unreviewed handoff bundle in task order.
4. Verify worktree, branch, base/head commits and dirty state against Git.
5. Verify external claims with read-only source/database checks where needed.
6. Review diffs, lineage, rejected rows, parser tests and storage impact.
7. Mark each task `accepted`, `changes_requested` or `blocked` in the queue.
8. Update canonical project status and issue the next task packet.

Codex does not ask OpenClaw to reconstruct the conversation. It resumes from the durable bundle and
independently verifies the claimed state.

## 8. Current State Discrepancy

As observed on 2026-06-30:

- `HANDOVER.md` says Council Registry Phase 1 is complete and POI is 175/247.
- `NEXT_ACTION.md` still instructs the next session to execute Council Registry Phase 1.
- `PROJECT_STATUS.md` still reports POI at 101/247 and Building Approvals as not started.

OpenClaw must verify actual database/Git state and reconcile all three files before accepting a new
implementation task. No database or deployment action should be based on the stale files.

## 9. Initial Work Sequence

1. **OC-DF-000 - State reconciliation:** OpenClaw verifies Council, POI, crime, VBA and Git state;
   updates the three continuity files; no implementation.
2. **OC-DF-001 - Source registry evidence:** OpenClaw prepares the source records required by
   `data_source_registry`, including terms, cadence, grain and Oracle raw paths; no Production write.
3. **CX-DF-001 - Registry/schema review:** Codex reviews canonical names, data classes, keys,
   storage estimates and migration design.
4. **OC-CP-001 - Council P0 ingestion:** OpenClaw acquires PPARS/VBA source data and produces
   Oracle artifacts plus QA reports in an isolated worktree.
5. **CX-CP-001 - Council P0 validation:** Codex verifies parser, deduplication, status semantics,
   metrics and Preview migration.
6. **OC-CP-002 - Monash/Manningham pilot:** OpenClaw builds two address-level Council adapters,
   subject to recorded terms and privacy restrictions.
7. **CX-SC-001 - Derived factors:** Codex implements approved planning/supply/rental-pressure
   formulas and confidence handling.
8. **CX-AI-001 - AI Summary:** Codex implements the bounded evidence package and explanation layer
   only after upstream gates pass.

## 10. Instruction for OpenClaw

```text
AusHomeValue data collaboration protocol is active.

Before any new work:
1. Read _orch/docs/OPENCLAW_CONTEXT_CONTINUITY_PROTOCOL.md.
2. Read _orch/docs/CODEX_OPENCLAW_DATA_COLLABORATION.md.
3. Read docs/data/SUBURB_INTELLIGENCE_DATA_CONTRACT_V2.md.
4. Verify Git, Production/Preview database state and current data coverage.
5. Execute OC-DF-000, write its handoff, then continue to OC-DF-001 if its queue entry remains
   `auto_continue: yes`.

Do not modify scoring, APIs or frontend.
Do not write Production data.
Do not deploy.
Do not delete or revert files.
Report discrepancies with evidence. After OC-DF-001, stop for Codex review; do not begin an
implementation task unless a later queue entry is explicitly marked `auto_continue: yes`.
```
