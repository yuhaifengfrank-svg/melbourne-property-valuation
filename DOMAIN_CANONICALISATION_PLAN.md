# Domain Canonicalisation Plan

**Date:** 2026-06-09  
**Based on:** DOMAIN_AUDIT_REPORT.md  

---

## Overview

The canonical domain is already `www.aushomevalue.com.au`.  
The only gap is a missing 301 redirect from `aushomevalue.vercel.app`.

---

## Gap Analysis

| What | Status | Action Required |
|---|---|---|
| Apex → www redirect | ✅ Already 308 redirects | None |
| Canonical tags | ✅ All point to www | None |
| Sitemap URLs | ✅ All point to www | None |
| robots.txt sitemap | ✅ Points to www | None |
| OpenGraph URLs | ✅ All point to www | None |
| **Vercel app → www redirect** | ❌ **Missing** | **Add 301 redirect** |
| DNS nameservers → Vercel | ❌ Not using Vercel DNS | Optional — current CNAME works |
| GSC domain-level property | ❌ URL-prefix only | Optional enhancement |

---

## Implementation Plan

### Step 1: DNS Changes ⏸ PAUSED — DO NOT EXECUTE

**No DNS changes required at this time.**  
The current setup works:
- `www.aushomevalue.com.au` CNAME → Vercel edge ✅  
- `aushomevalue.com.au` apex A → `216.198.79.1` (parked, 308 redirects to www) ✅  

**Optional future enhancement:**  
Change nameservers to Vercel's (not required — current CNAME setup works).  
This would allow Vercel to manage and auto-renew SSL.

**If changing nameservers is desired later:**
1. In Vercel Dashboard → Domain → aushomevalue.com.au → "Add Domain"
2. Follow Vercel's instructions to change nameservers to Vercel's
3. Remove current A record at Synergy Wholesale
4. Wait for DNS propagation (up to 48h)

---

### Step 2: Vercel Redirect — Add 301 from vercel.app → www

Add to `vercel.json`:

```json
{
  "redirects": [
    {
      "source": "/(.*)",
      "destination": "https://www.aushomevalue.com.au/$1",
      "permanent": true
    }
  ]
}
```

**Important placement:** This redirect must be added to `vercel.json` at the project root, but there's a constraint — Vercel only applies redirects for domains configured on the project. The `aushomevalue.vercel.app` domain is the **default Vercel deployment URL** and **cannot be redirected** via `vercel.json` redirects. Vercel's default `*.vercel.app` URLs cannot have redirect rules applied through project configuration.

**Alternative approaches for Vercel app redirect:**

| Approach | Works? | Effort |
|---|---|---|
| `vercel.json` redirects | ❌ Only for custom domains | — |
| Edge Middleware (`middleware.js`) | ✅ Yes — intercepts all requests | Medium |
| API catch-all that 301 redirects | ✅ Yes — but adds cold start latency | Medium |
| Accept both domains (canonical only) | ✅ Already done — lowest risk | None |

**Recommended approach: Edge Middleware**

Create `middleware.js` at project root:

```javascript
// middleware.js — 301 redirect Vercel app to canonical domain
export default function middleware(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  
  if (hostname === 'aushomevalue.vercel.app') {
    const destination = `https://www.aushomevalue.com.au${url.pathname}${url.search}`;
    return Response.redirect(destination, 301);
  }
  
  return Response.next();
}

export const config = {
  matcher: [
    // Match all paths except API (APIs need to work on production only)
    '/((?!api/).*)',
  ],
};
```

**Alternative (simpler): API-level redirect**

If Edge Middleware adds complexity, add this to `app.js`:

```javascript
// At the very top of app.js, before any routes
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host === 'aushomevalue.vercel.app') {
    return res.redirect(301, `https://www.aushomevalue.com.au${req.originalUrl}`);
  }
  next();
});
```

**But note:** Unless API, we are serving static files, so `app.js` won't handle these requests unless we add middleware.

**Conclusion:** No perfect solution for Vercel default URL redirect without edge functions. The **safest approach** is:
1. **Accept current state** — canonical tags already tell Google the preferred URL
2. If you want the redirect, use Vercel Edge Middleware (`middleware.js`)

---

### Step 3: Search Console Actions

#### Google Search Console
| Action | Details | Priority |
|---|---|---|
| GSC already configured | ✅ Both properties verified | Done |
| Sitemap already submitted | ✅ Both properties | Done |
| Add **domain property** | Optional: Add `aushomevalue.com.au` as Domain property via DNS TXT | Low |
| Request indexing | Use URL Inspection → Request Indexing for key pages | Medium |

**To add domain-level GSC property:**
1. Go to https://search.google.com/search-console
2. Add property → Domain → `aushomevalue.com.au`
3. Copy the DNS TXT record provided by GSC
4. Add TXT record at Synergy Wholesale DNS panel
5. Verify

#### Bing Webmaster Tools
| Action | Details | Priority |
|---|---|---|
| Sign in with Microsoft account | ⚠️ Requires manual login | **High** |
| Add site `https://www.aushomevalue.com.au` | Verification via HTML meta tag (already on page) | Medium |
| Submit sitemap | `https://www.aushomevalue.com.au/sitemap.xml` | Medium |

---

### Step 4: No Canonical Changes Needed

All of these already point to `www.aushomevalue.com.au`:
- ✅ `<link rel="canonical">` tags
- ✅ `<meta property="og:url">` tags
- ✅ `sitemap.xml` `<loc>` elements
- ✅ `robots.txt` Sitemap URL

---

## Implementation Order (if approved)

```
1. [⏸] DNS — Optional: add GSC domain-level TXT record
2. [⏸] DNS — Optional: switch to Vercel nameservers
3. [⏸] Vercel — Add middleware.js for 301 redirect
4. [🔧 User action] Bing — Sign in, add site, submit sitemap
5. [🔧 User action] GSC — Request indexing for key pages (after 3-7 days)
```

---

## Rollback Plan

| Change | Rollback |
|---|---|
| `middleware.js` 301 | Delete file, redeploy |
| DNS TXT record | Delete TXT record |
| Vercel nameservers | Change back to Synergy Wholesale nameservers |

---

## Verification Checklist (post-implementation)

- [ ] `https://aushomevalue.vercel.app/` returns 301
- [ ] `https://aushomevalue.vercel.app/suburb/scoresby-vic.html` → 301 to `https://www.aushomevalue.com.au/suburb/scoresby-vic.html`
- [ ] `https://aushomevalue.vercel.app/top-growth-suburbs-victoria.html` → 301 to `https://www.aushomevalue.com.au/top-growth-suburbs-victoria.html`
- [ ] Query params preserved: `https://aushomevalue.vercel.app/page?foo=bar` → `https://www.aushomevalue.com.au/page?foo=bar`
- [ ] API still works at `https://aushomevalue.vercel.app/api/ping`
- [ ] No broken redirect chains
- [ ] GSC: domain property verified (if DNS TXT added)
- [ ] Bing: site verified, sitemap submitted
