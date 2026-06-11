# Domain Audit Report

**Date:** 2026-06-09 18:57 AEST  
**Auditor:** 玄甲  
**Domain:** aushomevalue.com.au  

---

## 1. Domain Registration

| Property | Value |
|---|---|
| **Domain** | aushomevalue.com.au |
| **Registrar** | Synergy Wholesale Accreditations Pty Ltd |
| **Whois Server** | whois.auda.org.au |
| **Status** | ACTIVE, serverRenewProhibited |
| **Created** | 3 June 2026 (6 days ago) |

---

## 2. DNS Provider

| Property | Value |
|---|---|
| **DNS Provider** | Synergy Wholesale (nameserver.net.au) |
| **Nameservers** | ns1.nameserver.net.au |
| | ns2.nameserver.net.au |
| | ns3.nameserver.net.au |
| **Vercel DNS** | NOT configured (nameservers ≠ Vercel) |

---

## 3. Current DNS Records

| Record | Target | Notes |
|---|---|---|
| **apex A** | `216.198.79.1` | ❌ NOT a Vercel IP — legacy/parked page |
| **www CNAME** | `46dfe5d1b4c4c649.vercel-dns-017.com` | ✅ Vercel edge network |
| **MX** | `mx1.improvmx.com` (priority 10) | Email forwarding via ImprovMX |
| **MX** | `mx2.improvmx.com` (priority 20) | Email forwarding via ImprovMX |
| **TXT** | (none) | No Google verification, no SPF, no DKIM |

---

## 4. Current Vercel Domain Configuration

| Domain | Configured in Vercel | Edge Network | Nameserver Match |
|---|---|---|---|
| `aushomevalue.com.au` | ✅ Yes | ✅ Yes | ❌ (Synergy NS) |
| `www.aushomevalue.com.au` | ✅ Yes | ✅ Yes | ✅ (CNAME to Vercel) |

**Note:** Vercel shows nameservers as current ≠ intended (Synergy Wholesale nameservers, not Vercel's).  
The domain works via CNAME (www) and a A record (apex) pointing directly.

---

## 5. Current Redirects

| From | Status Code | To | Status |
|---|---|---|---|
| `aushomevalue.com.au` (apex) | **308** | `https://www.aushomevalue.com.au/` | ✅ Already redirects |
| `aushomevalue.vercel.app` | **200** | (none) | ❌ **NO redirect — serves same content** |
| `www.aushomevalue.com.au` | **200** | (none) | ✅ Canonical destination |

**Critical finding:** `aushomevalue.vercel.app` is NOT redirected to `www.aushomevalue.com.au`.  
Both domains serve identical content, which Google treats as duplicate content (mitigated by canonical tags, but a 301 is the authoritative signal).

---

## 6. Current Canonical URLs (all already on www)

| Page | Canonical URL | Status |
|---|---|---|
| **Homepage** | `https://www.aushomevalue.com.au/` | ✅ |
| **Top Growth** | `https://www.aushomevalue.com.au/top-growth-suburbs-victoria.html` | ✅ |
| **Top Value** | `https://www.aushomevalue.com.au/top-value-suburbs-victoria.html` | ✅ |
| **Top Yield** | `https://www.aushomevalue.com.au/top-yield-suburbs-victoria.html` | ✅ |
| **Top School** | `https://www.aushomevalue.com.au/top-school-zone-suburbs-victoria.html` | ✅ |
| **Suburb pages** | `https://www.aushomevalue.com.au/suburb/{name}.html` | ✅ |
| **Research pages** | `https://www.aushomevalue.com.au/research/{name}.html` | ✅ |
| **Opportunities** | `https://www.aushomevalue.com.au/opportunities/{name}.html` | ✅ |

---

## 7. Current Sitemap URLs

| Check | Status |
|---|---|
| **All URLs use www** | ✅ `https://www.aushomevalue.com.au/*` |
| **Total URLs** | 255 |
| **Sitemap submitted to GSC (www)** | ✅ |
| **Sitemap submitted to GSC (Vercel)** | ✅ |
| **robots.txt sitemap URL** | ✅ `https://www.aushomevalue.com.au/sitemap.xml` |

---

## 8. Current robots.txt

| Check | Status |
|---|---|
| **Sitemap URL** | ✅ `https://www.aushomevalue.com.au/sitemap.xml` |
| **Disallow /api/** | ✅ |
| **Disallow ?debug=true** | ✅ |
| **Crawl-Delay** | 10s for all major bots |
| **Allows /** | ✅ |

---

## 9. JSON-LD Structured Data URLs

| Page | Check | Status |
|---|---|---|
| Homepage | No JSON-LD found | ⚠️ Missing (not urgent) |
| Top pages | JSON-LD uses relative URLs | ⚠️ Should verify all use www |
| Suburb pages | JSON-LD written by generator | ⚠️ Should verify |

---

## 10. OpenGraph URLs

| Page | Check | Status |
|---|---|---|
| **Homepage** | `og:url` = `https://www.aushomevalue.com.au/` | ✅ |
| **Top Growth** | `og:url` = `https://www.aushomevalue.com.au/top-growth...` | ✅ |
| **Suburb pages** | `og:url` = `https://www.aushomevalue.com.au/suburb/{name}` | ✅ |

---

## Summary of Findings

| Issue | Severity | Status |
|---|---|---|
| `aushomevalue.vercel.app` serves same content with no redirect | 🔴 **High** | Needs 301 |
| `aushomevalue.com.au` apex already redirects (308) to www | 🟢 Good | Already fixed |
| Canonical URLs all point to www | 🟢 Good | Already fixed |
| Sitemap URLs all point to www | 🟢 Good | Already fixed |
| robots.txt points to www sitemap | 🟢 Good | Already fixed |
| og:url all use www | 🟢 Good | Already fixed |
| Apex A record points to non-Vercel IP | 🟡 Medium | DNS wildcard/lag, but CNAME handles www |

**The only real gap:** `aushomevalue.vercel.app` → `www.aushomevalue.com.au` 301 redirect.

Deliverables:
- DOMAIN_CANONICALISATION_PLAN.md
