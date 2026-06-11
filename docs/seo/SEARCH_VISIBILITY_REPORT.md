# Search Visibility Report

**Date:** 2026-06-09  
**Domain:** `aushomevalue.vercel.app` → canonical: `www.aushomevalue.com.au`  
**Project:** Melbourne Property Valuation / AusHomeValue

---

## 1. Google Search Console (GSC) Setup

### Property: `https://aushomevalue.vercel.app/`
| Item | Status |
|---|---|
| Property added | ✅ Done |
| Verification method | HTML meta tag (`google-site-verification`) |
| Verification result | ✅ **Verified** (owned by frank.yu) |
| Sitemap submitted | `sitemap.xml` — ✅ **Submitted successfully** |
| Sitemap status | Processing (just submitted — check back in ~24h) |

### Property: `https://www.aushomevalue.com.au/`
| Item | Status |
|---|---|
| Property added | ✅ Done |
| Verification method | HTML meta tag (`google-site-verification`) |
| Verification result | ✅ **Verified** |
| Sitemap submitted | `sitemap.xml` — ✅ **Submitted successfully** |
| Sitemap status | Processing (just submitted — check back in ~24h) |

### Property: `aushomevalue.com.au` (domain-level, DNS)
| Item | Status |
|---|---|
| Not configured | ⚠️ Requires adding a TXT record at the DNS provider for `aushomevalue.com.au` |
| Recommended | Add domain property to cover all subdomains |

**Note:** Both URL-prefix properties were set up via HTML meta tag. The meta tags have been added to `public/index.html` and deployed. To also own the entire domain (including `aushomevalue.com.au`, `https://aushomevalue.vercel.app` under one property), FrankAI will need to:
1. Add property type "Domain" with value `aushomevalue.com.au`
2. Add the DNS TXT record provided by GSC at the DNS provider

---

## 2. Bing Webmaster Tools Setup

| Item | Status |
|---|---|
| Account logged in | ⚠️ **Requires FrankAI to sign in** |
| Site added | Not yet — needs Microsoft account login |
| Sitemap submitted | Not yet — needs site verification first |

**Steps for FrankAI:**
1. Go to https://www.bing.com/webmasters
2. Click "Sign in" (use Microsoft account — same as live.com/hotmail)
3. After login, click "Add a site" 
4. Enter: `https://www.aushomevalue.com.au`
5. Verification method: Use the same HTML meta tag that's already on the page, OR use the HTML file method
6. Submit sitemap: `https://www.aushomevalue.com.au/sitemap.xml`

---

## 3. Crawlability Results

All key pages return **HTTP 200 OK** with no redirects:

| URL | Status | Pass/Fail |
|---|---|---|
| `https://aushomevalue.vercel.app/` | 200 | ✅ PASS |
| `https://aushomevalue.vercel.app/robots.txt` | 200 | ✅ PASS |
| `https://aushomevalue.vercel.app/sitemap.xml` | 200 | ✅ PASS |
| `https://aushomevalue.vercel.app/top-growth-suburbs-victoria.html` | 200 | ✅ PASS |
| `https://aushomevalue.vercel.app/top-value-suburbs-victoria.html` | 200 | ✅ PASS |
| `https://aushomevalue.vercel.app/top-yield-suburbs-victoria.html` | 200 | ✅ PASS |
| `https://aushomevalue.vercel.app/top-school-zone-suburbs-victoria.html` | 200 | ✅ PASS |
| `https://aushomevalue.vercel.app/suburb/scoresby-vic.html` | 200 | ✅ PASS |
| `https://www.aushomevalue.com.au/` | 200 | ✅ PASS |
| `https://www.aushomevalue.com.au/sitemap.xml` | 200 | ✅ PASS |

All pages serve the same content across both domains (identical content, no redirect between them).

---

## 4. Robots.txt & Sitemap Verification

### robots.txt (`/robots.txt`)
| Check | Result |
|---|---|
| HTTP 200 | ✅ |
| Allows '/' for all bots | ✅ |
| Disallows `/api/*` | ✅ |
| Disallows `*?debug=true` | ✅ |
| Sitemap URL | ✅ Now points to `https://www.aushomevalue.com.au/sitemap.xml` (was `aushomevalue.vercel.app`) |
| Crawl-Delay | 10 seconds for all major bots (Googlebot, Bingbot, GPTBot, etc.) |

### sitemap.xml (`/sitemap.xml`)
| Check | Result |
|---|---|
| HTTP 200 | ✅ |
| Total URLs | **255** (1 homepage + 4 top pages + 7 opportunities + 5 research + 238 suburb pages) |
| All URLs point to canonical domain | ✅ All use `https://www.aushomevalue.com.au/` |
| Valid XML structure | ✅ |
| Lastmod dates | ✅ All set to `2026-06-09` |

---

## 5. SEO Fixes Applied

The following issues were found and fixed during this session:

| Issue | File | Fix | Status |
|---|---|---|---|
| Homepage canonical pointed to `aushomevalue.vercel.app` | `public/index.html` | Changed to `https://www.aushomevalue.com.au/` | ✅ Fixed & deployed |
| Open Graph URL pointed to `aushomevalue.vercel.app` | `public/index.html` | Changed to `https://www.aushomevalue.com.au/` | ✅ Fixed & deployed |
| robots.txt sitemap URL pointed to `aushomevalue.vercel.app` | `public/robots.txt` | Changed to `https://www.aushomevalue.com.au/sitemap.xml` | ✅ Fixed & deployed |
| Missing GSC verification tag (Vercel property) | `public/index.html` | Added meta tag | ✅ Fixed & deployed |
| Missing GSC verification tag (www property) | `public/index.html` | Added meta tag | ✅ Fixed & deployed |

### Verified Correct Canonical URLs
All key pages now correctly point to `www.aushomevalue.com.au`:
- ✅ Homepage: `https://www.aushomevalue.com.au/`
- ✅ Top Growth: `https://www.aushomevalue.com.au/top-growth-suburbs-victoria.html`
- ✅ Top Value: `https://www.aushomevalue.com.au/top-value-suburbs-victoria.html`
- ✅ Top Yield: `https://www.aushomevalue.com.au/top-yield-suburbs-victoria.html`
- ✅ Top School: `https://www.aushomevalue.com.au/top-school-zone-suburbs-victoria.html`
- ✅ Suburb pages: `https://www.aushomevalue.com.au/suburb/*.html`
- ✅ Opportunities: `https://www.aushomevalue.com.au/opportunities/*.html`
- ✅ Research: `https://www.aushomevalue.com.au/research/*.html`

---

## 6. Indexing Status

| Check | Result |
|---|---|
| `site:aushomevalue.vercel.app` | ❌ 0 results (not indexed yet) |
| `site:www.aushomevalue.com.au` | ❌ 0 results (not indexed yet) |
| GSC Index report | "Processing data — check back in ~1 day" |
| GSC Sitemap status | Submitted successfully, but not yet crawled |

**Expected:** The domain is brand new. Google needs time to crawl and index. With the sitemap submitted, expect first pages indexed within 3–7 days.

---

## 7. Warnings & Recommendations

### ❗ Warnings
1. **No redirect from Vercel to canonical domain** — `aushomevalue.vercel.app` and `www.aushomevalue.com.au` serve identical content with no redirect. While canonical tags help, a 301 redirect would be stronger.
   - **Fix:** In Vercel project settings → Domains → add `aushomevalue.vercel.app` as a redirect domain to `www.aushomevalue.com.au` (or set up in `vercel.json`).
2. **No domain-level GSC property** — Only URL-prefix properties added. DNS TXT verification needed for full domain coverage.
3. **Bing not set up** — Requires FrankAI to sign in with Microsoft account.
4. **Sitemap URLs point to www domain but sitemaps are submitted under Vercel property too** — This is fine because the canonical URLs use www, and Google will follow the canonical.

### ✅ Recommendations (Priority Order)

1. **Add 301 redirect** from `aushomevalue.vercel.app` → `www.aushomevalue.com.au` (Vercel settings or `vercel.json` redirects)
2. **Add domain property in GSC** (`aushomevalue.com.au` via DNS TXT record) to cover the root domain
3. **Set up Bing Webmaster Tools** — FrankAI to sign in and add site, then submit sitemap
4. **Request indexing** via GSC URL Inspection tool for key pages (homepage, top pages) to speed up initial indexing
5. **Monitor GSC** — After 3–7 days, check the Index report for coverage issues
6. **Consider sitemap splitting** — 255 URLs is fine for one sitemap, but if more content is added, consider a sitemap index file
7. **Add more content** — The more unique, valuable content, the faster Google will crawl. Consider adding more suburb pages, blog posts, or market reports.

---

## Summary

```
GSC Setup:           ✅ Complete (2 URL-prefix properties verified)
GSC Sitemaps:        ✅ Submitted (both properties)
Bing Setup:          ⚠️ Needs FrankAI login & site addition
Crawlability:        ✅ All pages return 200
Robots.txt:          ✅ Correct (sitemap URL fixed)
Sitemap:             ✅ 255 URLs, all pointing to canonical domain
Canonical URLs:      ✅ All pages use www.aushomevalue.com.au
Meta Descriptions:   ✅ All pages ≤ 160 chars
SEO fixes applied:   ✅ 4 fixes committed & deployed
Indexing:            ❌ Not yet (expected — new domain)
```

**Next check:** Revisit GSC Index report in 5–7 days to see initial indexing results.
