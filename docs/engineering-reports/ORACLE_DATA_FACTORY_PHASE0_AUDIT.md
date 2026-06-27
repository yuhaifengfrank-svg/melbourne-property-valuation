# Oracle Data Factory — Phase 0 Audit Report

Date: 2026-06-23 16:16 AEST  
Machine: `au-scraper` (Oracle Cloud Free Tier VM)  
Host: `161.33.90.191`  
User: `ubuntu` (via SSH key)

---

## Summary

Oracle Cloud Free Tier VM provisioned and baselined as **AusHomeValue offline data factory**. Directory structure established under `/opt/aushomevalue/`, runtime dependencies verified, network reachability confirmed for all target public data sources. Ready for Phase 1 pilot (ABS/RBA ingestion → transform → artifact → sync).

---

## 1. OS Version

| Field | Value |
|-------|-------|
| OS | **Ubuntu 24.04.4 LTS** |
| Kernel | Linux (booted with new kernel, reboot pending) |
| Hostname | `au-scraper` |
| Architecture | x86_64 |

---

## 2. Hardware Specs

| Resource | Value | Notes |
|----------|-------|-------|
| vCPU | **2** (1 core × 2 threads, AMD EPYC 7551) | Sufficient for ETL workloads |
| RAM | **954 MB total** | 384 MB available baseline; **bottleneck for PostGIS** |
| Swap | **2.0 GB** (new) | Added as OOM safety margin |
| Disk | **46 GB** total (`/dev/sda1` ext4), 6.5 GB used, 38 GB free | Plenty for raw/processed/artifacts |
| CPU Cache | L1 64K, L2 512K, L3 16 MiB | Adequate |

---

## 3. Current User

| Field | Value |
|-------|-------|
| Username | `ubuntu` |
| UID:GID | `1001:1001` |
| Groups | `ubuntu, adm, cdrom, sudo, dip, lxd` |
| Sudo | ✅ Passwordless (`sudo -n` passes) |

---

## 4. Runtime Versions

| Tool | Version | Status |
|------|---------|--------|
| Python | **3.12.3** | ✅ |
| pip | **24.0** | ✅ |
| Node.js | **v22.23.0** | ✅ |
| npm | **10.9.8** | ✅ |
| Git | **2.43.0** | ✅ |

---

## 5. CLI Tools

| Tool | Version | Status |
|------|---------|--------|
| curl | 8.5.0 | ✅ |
| unzip | — | ✅ |
| gzip | 1.12 | ✅ |
| jq | 1.7 | ✅ |
| wget | 1.21.4 | ✅ |
| GDAL/ogr2ogr | 3.8.4 | ✅ |
| psql | 16.14 | ✅ |

---

## 6. Network Reachability

| Domain | HTTP Code | Latency | Status |
|--------|-----------|---------|--------|
| `abs.gov.au` | 301 | 0.12s | ✅ Reachable |
| `rba.gov.au` | 302 | 0.27s | ✅ Reachable |
| `data.gov.au` | 200 | 0.26s | ✅ Reachable |
| `planning.data.vic.gov.au` | 000 (timeout) | 0.03s | ❌ **Unreachable** (connection refused) |
| `mapshare.vic.gov.au` | 200 | 0.19s | ✅ Reachable |

**Note:** `planning.data.vic.gov.au` may require an API key or specific endpoint path. `mapshare.vic.gov.au` serves as fallback for VicPlan data access.

---

## 7. Open Ports

| Port | Protocol | Service | Scope |
|------|----------|---------|-------|
| 22 | TCP | SSH | 0.0.0.0 (public) |
| 111 | TCP | rpcbind | 0.0.0.0 + :: |
| 53 | TCP | systemd-resolve | 127.0.0.x (loopback only) |

**Security:** Port 22 (SSH) is publicly open as expected for a VM server. No unexpected services exposed. No HTTP/HTTPS servers running.

---

## 8. Directory Tree

```
/opt/aushomevalue/
├── app/
│   ├── ingest/          # Data ingestion scripts
│   ├── transform/       # Raw → processed transformation
│   ├── export/          # Processed → artifacts export
│   └── sync/            # Artifacts → Neon sync
├── data/
│   ├── raw/
│   │   ├── abs/         # ABS census raw downloads
│   │   ├── rba/         # RBA data raw downloads
│   │   ├── vicplan/     # VicPlan zone/overlay raw data
│   │   └── parcel/      # [Reserved] Cadastral parcel data
│   ├── processed/
│   │   ├── abs/
│   │   ├── rba/
│   │   ├── vicplan/
│   │   └── parcel/
│   └── artifacts/
│       ├── suburb_summary/
│       ├── planning_summary/
│       ├── macro_summary/      # [New] ABS+RBA macro indicators
│       └── api_exports/        # [New] Ready-to-serve API JSON
├── logs/
│   ├── ingest/
│   ├── transform/
│   └── sync/
├── config/
│   ├── .env.example     # Template only — no secrets
│   ├── sources.yaml     # [Empty] Data source definitions
│   └── sync.yaml        # [Empty] Neon sync config
├── db/
│   ├── schema/          # [Reserved] Schema definitions
│   ├── migrations/      # [Reserved] Future PG migrations
│   └── scratch/         # [Reserved] Temporary DB workspace
├── backups/             # [New] Data backups
└── .gitignore
```

---

## 9. Permission Summary

| Path | Permission | Owner | Notes |
|------|-----------|-------|-------|
| `/opt/aushomevalue/` | `755` | `ubuntu:ubuntu` | ✅ |
| `/opt/aushomevalue/config/` | **`700`** | `ubuntu:ubuntu` | ✅ **Restricted — only owner access** |
| `/opt/aushomevalue/.gitignore` | `664` | `ubuntu:ubuntu` | ✅ |
| All sub-directories | `755` | `ubuntu:ubuntu` | ✅ |

`config/.env` deliberately **not created** — only `.env.example` exists with no secrets.

---

## 10. What Was NOT Done

Per Phase 0 constraints, the following were **intentionally omitted**:

| Action | Status | Reason |
|--------|--------|--------|
| Connect to Neon | ❌ | Phase 0 — offline only |
| Connect to Vercel | ❌ | Phase 0 — no deploy |
| Connect to Stripe | ❌ | Not in scope |
| Download large data | ❌ | Phase 1 scope |
| Run scraper | ❌ | Stays in `/home/ubuntu/scraper/` |
| Write Production DB | ❌ | Never direct |
| Modify business code | ❌ | No repo changes |
| Store real secrets | ❌ | `.env` not created |
| Push / deploy | ❌ | No git remote |
| PostgreSQL + PostGIS | ❌ | File-path only; `db/` reserved for future |
| Firewall changes | ❌ | `ss` inspect only |

---

## 11. Risk Items & Recommended Next Steps

### Risk Items

| Risk | Impact | Mitigation |
|------|--------|------------|
| **RAM (954 MB)** — tight for large spatial processing | Slowdowns / OOM for large datasets | File-path approach (no PostGIS); 2G swap added |
| **`planning.data.vic.gov.au` unreachable** | Cannot download VicPlan data directly | Fallback: `mapshare.vic.gov.au` works; may need API key |
| **Pending reboot** (kernel update) | No effect now, will need future reboot | Non-urgent — plan with user |
| **Port 22 exposed publicly** | Standard for VM, but attack surface | SSH key auth only (no password), logs auditable |
| **No backup strategy** | Data loss on VM termination | Backups dir created; recommend `rsync` or `tar` to external |

### Recommended Phase 1

1. **Install Python ETL packages** — Create venv + install pandas, geopandas, requests, pyarrow
2. **Write `.env.example` + `config/sources.yaml`** — Template Neon connection, data source URLs
3. **Pilot pipeline: ABS Census** — Download 2021 GCP zip → parse CSV → aggregate suburb summary → write artifact JSON
4. **Pilot pipeline: RBA Cash Rate** — Fetch from RBA CSV → parse → write macro_summary artifact
5. **Pilot pipeline: VicPlan (Monash sample)** — Fetch Monash LGA GeoJSON → ogr2ogr flatten → groupby zone → write planning_summary artifact
6. **Configure `config/sync.yaml`** — Define Preview Neon target
7. **Test sync dry-run** — Read artifact + psql `\copy` to Preview Neon (manual review first)
8. **Codex review** before any Production Neon sync

---

## Appendix A: `.gitignore`

```
config/.env
data/raw/**
data/processed/**
data/artifacts/**
logs/**
db/**
*.pyc
__pycache__/
.venv/
```

## Appendix B: Swappiness

`vm.swappiness=10` set to limit swap usage and prioritize file cache for ETL workloads.

---

*End of Phase 0 audit. Ready for Codex review.*
