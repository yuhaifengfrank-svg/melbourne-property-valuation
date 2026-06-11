# VIDEO FACTORY V1 PLAYBOOK

**Last updated:** 2026-06-11  
**Branch:** main  
**Location:** `scripts/video-factory/`

---

## Overview

Video Factory V1 is a screenshot asset pipeline that:
1. Takes a topic name
2. Navigates to relevant pages on aushomevalue.com.au
3. Captures desktop + mobile screenshots of specific sections
4. Organizes them into `/video-assets/{topic}/`

No paid software. Uses existing Puppeteer dependency.

---

## How to Use

```bash
cd /Users/FrankAI/Documents/澳洲房地产评估系统

# Generate assets for a specific topic
node scripts/video-factory/capture-topic.mjs --topic "Why Werribee Scores Highly" --suburb werribee-vic

# Generate for all known topics
node scripts/video-factory/capture-all.mjs
```

Or use the npm script:
```bash
npm run video-assets -- --topic "Top Growth Suburbs"
```

---

## Topic → URL Mapping

| Topic | Ranking URL | Suburb URL Pattern |
|-------|-------------|-------------------|
| Why {Suburb} Scores Highly | — | `/suburb/{slug}.html` |
| Top Growth Suburbs | `/top-growth-suburbs-victoria.html` | `/suburb/{slug}.html` |
| Top Value Suburbs | `/top-value-suburbs-victoria.html` | `/suburb/{slug}.html` |
| Top Yield Suburbs | `/top-yield-suburbs-victoria.html` | `/suburb/{slug}.html` |
| Top School Zone Suburbs | `/top-school-zone-suburbs-victoria.html` | `/suburb/{slug}.html` |

---

## Asset Output Structure

```
video-assets/{topic}/
├── 01-homepage.png                # Desktop full page
├── 01-homepage-mobile.png         # Mobile (390x844)
├── 02-ranking-page.png            # Desktop ranking page (if applicable)
├── 02-ranking-page-mobile.png     # Mobile ranking page
├── 03-suburb-page.png             # Desktop full suburb page
├── 03-suburb-page-mobile.png      # Mobile suburb page
├── 04-confidence-card.png         # "Overall Intelligence Confidence" area
├── 04-confidence-card-mobile.png
├── 05-factor-breakdown.png        # Factor Breakdown section
├── 05-factor-breakdown-mobile.png
├── 06-why-this-suburb.png         # "Why {Suburb} Scores Highly" section
├── 06-why-this-suburb-mobile.png
├── 07-opportunity-card.png        # Opportunity ranking card on homepage
└── 07-opportunity-card-mobile.png
```

---

## Prerequisites

- Node.js ≥ 20.x
- Puppeteer (already in package.json devDependencies)
- `video-assets/` in `.gitignore` (optional — large binary files)

---

## Technical Notes

### Viewport sizes
- Desktop: 1440×900
- Mobile: 390×844 (iPhone 14 Pro)

### Screenshot mode
- Full page for homepage, ranking, suburb pages
- Clipped region for confidence card, factor breakdown, why this suburb
- Clipping uses text-based element detection (XPath `contains(text(), ...)`) for reliability

### Handling dynamic content
- Wait for `networkidle0` before capture
- Extra 1.5s render delay for lazy-loaded elements
- Re-get element positions after scroll (DOM shifts)

---

## Adding New Topics

Add to the mapping in `scripts/video-factory/topics.json`:

```json
{
  "name": "Why Werribee Scores Highly",
  "suburb": "werribee-vic",
  "hasRanking": false,
  "suburbScreenshots": ["full", "confidence", "factors", "strengths", "risks"]
}
```

Then run `node scripts/video-factory/capture-topic.mjs --topic "Why Werribee Scores Highly"`.
