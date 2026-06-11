# VIDEO FACTORY V1 REPORT

**Date:** 2026-06-11  
**Status:** Complete  
**Branch:** main  
**Commit:** latest (includes all video assets)

---

## Architecture

```
Website (aushomevalue.com.au)
      │
      ▼
Screenshot Pipeline (Puppeteer)
      │
      ▼
video-assets/{topic}/
  ├── {n}-{section}.png          (Desktop, 1440×900)
  └── {n}-{section}-mobile.png   (Mobile, 390×844)
      │
      ▼
CapCut / Video Editor
  └── Import screenshots + script + TTS voiceover
      │
      ▼
Ready-to-post video
```

---

## Delivered Topics

### Topic: Why Werribee Scores Highly
**Path:** `video-assets/werribee/`
| File | Content |
|------|---------|
| 01-homepage.png | Full homepage desktop |
| 02-werribee-suburb.png | Full Werribee suburb page |
| 03-confidence-card.png | "Overall Intelligence Confidence" (High) |
| 04-top-strengths.png | "Why Werribee Scores Highly" (Value 70, Growth 85, Infrastructure 85) |
| 05-top-risks.png | Low factors (Yield 23/C, Vacancy 50/B, School 45/C) |
| 06-investment-suitability.png | Full Factor Breakdown (9 factors scored) |

### Topic: Top Growth Suburbs
**Path:** `video-assets/top-growth/`
| File | Content |
|------|---------|
| 01-homepage.png | Full homepage desktop |
| 01-homepage-mobile.png | Mobile homepage |
| 02-ranking-page.png | Top Growth ranking page |
| 02-ranking-page-mobile.png | Mobile ranking page |

### Topic: Top Value Suburbs
**Path:** `video-assets/top-value/`
| File | Content |
|------|---------|
| 01-homepage.png + mobile | Homepage |
| 02-ranking-page.png + mobile | Top Value ranking |

### Topic: Top School Zone Suburbs
**Path:** `video-assets/top-school/`
| File | Content |
|------|---------|
| 01-homepage.png + mobile | Homepage |
| 02-ranking-page.png + mobile | School Zone ranking |

### Topic: Best First Home Buyer Suburbs
**Path:** `video-assets/first-home/`
| File | Content |
|------|---------|
| 01-homepage.png + mobile | Homepage |
| 02-ranking-page.png + mobile | Value ranking (same as Top Value — intentional) |

---

## Pipeline Script

**Script:** `scripts/video-factory/capture-topic.mjs`

### Usage
```bash
# Capture all topics
npm run video:assets

# Capture a single topic
npm run video:topic -- "Why Werribee Scores Highly"

# Or direct
node scripts/video-factory/capture-topic.mjs --topic "Top Growth Suburbs"
```

### How it works
1. Reads `scripts/video-factory/topics.json` for topic configuration
2. Generates a Puppeteer CJS script per topic
3. Runs it to capture desktop (1440×900) and mobile (390×844) screenshots
4. Uses text-based element detection (`XPath contains(text(),...)`) for precise region clipping
5. Outputs organized folder at `video-assets/{slug}/`

### Re-running
If website data updates, just re-run:
```bash
npm run video:assets
```
All old screenshots will be replaced.

---

## File Naming Convention

```
video-assets/{topic-slug}/
├── 01-homepage.png
├── 01-homepage-mobile.png
├── 02-ranking-page.png          (if topic has ranking)
├── 02-ranking-page-mobile.png
├── 03-suburb-page.png           (if suburb-specific topic)
├── 03-suburb-page-mobile.png
├── 04-confidence-card.png       (suburb only)
├── 04-confidence-card-mobile.png
├── 05-factor-breakdown.png      (suburb only)
├── 06-why-this-suburb.png       (suburb only)
└── 07-opportunity-card.png      (risks/low factors, suburb only)
```

Desktop: 1440×900 (scrollable full page or clipped region)  
Mobile: 390×844 (full page or clipped region)

---

## Free Tool Stack

| Stage | Tool | Cost | Notes |
|-------|------|------|-------|
| Screenshots | Puppeteer (already in project) | Free | Installed |
| Video editing | CapCut desktop | Free | Import screenshots + TTS |
| Voiceover | Edge-TTS or CosyVoice 3 | Free | See FREE_AI_VOICE_RESEARCH.md |
| Subtitles | CapCut auto-captions | Free | Built-in |
| Music | CapCut free library | Free | Built-in |
| Thumbnails | Canva free tier or Figma | Free | Or screenshot + text overlay |

---

## Video Project Package

After Phase 2, each topic will also have:
```
video-projects/{topic}/
├── script.txt          # Narration script (Chinese)
├── captions.srt        # Subtitles file
├── scene-plan.md       # Which screenshot at which second
└── asset-list.md       # All files needed
```

Phase 2 is ready to start once the content style templates are finalized.

---

## What's Built vs What's Next

| Phase | Status |
|-------|--------|
| Phase 1: Screenshot Pipeline | ✅ Complete (5 topics, 34 files) |
| Phase 2: CapCut Package | 📋 Ready to implement |
| Phase 3: Content Style V2 | 🔄 Sub-agent generating |
| Phase 4: Template Library | 🔄 Sub-agent generating |
| Phase 5: Free AI Voice Research | ✅ Complete |
