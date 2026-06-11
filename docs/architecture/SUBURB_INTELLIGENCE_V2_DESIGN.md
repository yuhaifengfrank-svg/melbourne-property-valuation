# Suburb Intelligence V2 Design Report

## Objective

Add a new "Why [Suburb] Scores Highly" section to suburb intelligence pages, including:

1. Top strengths and risks (from existing 9 factors)
2. Investment suitability classification (investor type recommendations)
3. All driven by existing factor data — no new datasets or scoring changes

---

## Design Principles

- **No backend changes** — all logic is frontend-side classification using existing factor scores
- **No new datasets** — uses the 9 factor scores already served by `/api/suburb-intelligence`
- **Reusable** — same component works for any suburb
- **Bilingual** — English + 简体中文

---

## Component: Why [Suburb] Scores Highly

### Layout (Desktop)

```
┌─────────────────────────────────────────────────────────────┐
│  💡 Why Werribee Scores Highly                              │
│                                                             │
│  ┌─ Top Strengths ──────────────────────┐                   │
│  │                                     │                   │
│  │ 🟢 Value        70/100  B+          │                   │
│  │    Median house price $730K is below │                   │
│  │    Melbourne median — strong value   │                   │
│  │                                     │                   │
│  │ 🟢 Growth       65/100  B+          │                   │
│  │    10.5% 3yr CAGR, above market avg │                   │
│  └─────────────────────────────────────┘                   │
│                                                             │
│  ┌─ Key Risks ──────────────────────────┐                   │
│  │                                     │                   │
│  │ 🟡 Vacancy      35/100  C           │                   │
│  │    8.9% — above Melbourne average    │                   │
│  │                                     │                   │
│  │ 🟡 School       30/100  D           │                   │
│  │    Below-average NAPLAN scores      │                   │
│  └─────────────────────────────────────┘                   │
│                                                             │
│  ┌─ Investment Suitability ──────────────┐                   │
│  │  Suitable for:                        │                   │
│  │  ✅  First Home Buyers  (affordable)  │                   │
│  │  ✅  Growth Investors   (3yr growth) │                   │
│  │  ❌  Yield Investors    (low yield)   │                   │
│  │  ❌  Families           (school)      │                   │
│  └─────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Layout (Mobile)

```
┌────────────────────────┐
│  💡 Why Werribee?      │
├────────────────────────┤
│  Top Strengths         │
│                        │
│  🟢 Value  70/100 B+  │
│  🟢 Growth 65/100 B+  │
│                        │
│  Key Risks             │
│                        │
│  🟡 Vacancy 35/100 C  │
│  🟡 School  30/100 D  │
│                        │
│  Investment Suitability│
│  ✅ First Home Buyers  │
│  ✅ Growth Investors   │
│  ❌ Yield Investors    │
│  ❌ Families           │
└────────────────────────┘
```

---

## Investment Suitability Logic

### Mappings (Frontend-only classification, no backend changes)

| Investor Type | Key Factors | Rules |
|---------------|-------------|-------|
| **Growth Investors** | growth, supply | growth ≥ 55 OR (growth ≥ 40 AND supply ≥ 50) OR (growth_3y ≥ 15%) |
| **Yield Investors** | yield | yield ≥ 55 OR gross_yield ≥ 4.0% OR (yield ≥ 40 AND vacancy ≤ 5) |
| **Families** | school, value | school ≥ 60 OR (school ≥ 40 AND dwelling_separate_house ≥ 60%) |
| **First Home Buyers** | value, growth | value ≥ 70 OR (value ≥ 55 AND growth ≥ 50) OR median_house_price < $750K |

### "Suitable For" Display

Each investor type gets:
- ✅ **Recommended** — primary factor meets threshold
- ⚠️ **Potential** — secondary condition met, borderline
- ❌ **Not ideal** — both conditions fail, with one-line reason

Reason text examples:
```
Growth Investors:
  ✅ 3yr CAGR 15%+ — strong capital growth trajectory
  ⚠️ Growth score 45 — moderate, supply constraint supports pricing
  ❌ Flat growth (-2% 3yr CAGR) — limited appreciation potential

Yield Investors:
  ✅ Gross yield 4.5% — healthy rental return
  ⚠️ Yield 42 with low vacancy — moderate with stable demand
  ❌ Yield 2.2% — below 3% threshold, reinvest elsewhere

Families:
  ✅ School score 82 (A) — above-average school zone
  ⚠️ School moderate, 72% detached homes — reasonable family area
  ❌ Limited school data + low detached housing — not ideal for families

First Home Buyers:
  ✅ Median $580K — highly affordable entry point
  ⚠️ Median $850K — moderate but below Melbourne median
  ❌ Median above $1.2M — out of FHB range
```

---

## Implementation: Extend trust-layer.js

### New Functions

```javascript
function buildSuitabilityCard(data, lang) {
  // Reads factor scores + raw metrics from suburb-intelligence API
  // Returns HTML with 4 investor types, each with ✅ ⚠️ ❌ + reason
}
```

### Data Flow

Existing `renderWithData()` already has the factor array. The suitability card is a new section within the existing "Why Suburb" card or as a separate card.

### CSS Additions

```
.trust-suitability       { margin-top: 1rem; border-top: 1px solid var(--line,#dbe2de); padding-top: 0.75rem; }
.trust-investor-row      { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: start; padding: 4px 0; }
.trust-investor-label    { font-weight: 600; font-size: 0.9rem; white-space: nowrap; }
.trust-investor-badge    { display: inline-flex; align-items: center; gap: 4px; font-size: 0.78rem; padding: 2px 8px; border-radius: 20px; }
.trust-investor-yes      { background: #d1fae5; color: #065f46; }
.trust-investor-maybe    { background: #fef3c7; color: #92400e; }
.trust-investor-no       { background: #fce7f3; color: #9d174d; }
.trust-investor-reason   { font-size: 0.78rem; color: var(--muted,#66736d); grid-column: 1 / -1; margin: 0 0 2px 1.5rem; }
```

### renderWithData Changes

```diff
  if (showWhySuburb && factors.length > 1) {
    html += buildWhyHTML(confSummary, lang);
+   html += buildSuitabilityHTML(data, confSummary, lang);
  }
```

---

## Investment Suitability Reason Templates

### Growth Investors

```javascript
function suitabilityGrowth(data) {
  const g3 = data.growth_3y || data.growth?.raw;
  const gScore = data.growth?.score || 0;
  if (gScore >= 55 || g3 >= 15) {
    return { verdict: 'yes', reason: lang === 'zh' 
      ? '3年复合增长率' + g3.toFixed(1) + '% — 强劲资本增值潜力'
      : g3 + '% 3yr CAGR — strong capital growth trajectory' };
  }
  if (gScore >= 40 || g3 >= 5) {
    return { verdict: 'maybe', reason: lang === 'zh'
      ? '增长' + gScore + '分 — 中等，供应约束支持定价'
      : 'Growth score ' + gScore + ' — moderate, supply supports pricing' };
  }
  return { verdict: 'no', reason: lang === 'zh'
    ? '低增长率 — 资本增值有限'
    : 'Low growth trajectory — limited appreciation potential' };
}
```

### Yield Investors

```javascript
function suitabilityYield(data) {
  const y = data.gross_yield;
  const yScore = data.yield?.score || 0;
  if (yScore >= 55 || y >= 4) {
    return { verdict: 'yes', reason: 'Gross yield ' + y.toFixed(1) + '% — healthy rental return' };
  }
  if (yScore >= 40 || y >= 3) {
    return { verdict: 'maybe', reason: 'Yield ' + y.toFixed(1) + '% — moderate with stable demand' };
  }
  return { verdict: 'no', reason: 'Yield ' + (y ? y.toFixed(1) : 'data unavailable') + '% — below threshold' };
}
```

### Families

```javascript
function suitabilityFamilies(data) {
  const sScore = data.school?.score || 0;
  const detached = data.dwelling_separate_house || 0;
  if (sScore >= 60) {
    return { verdict: 'yes', reason: 'School score ' + sScore + ' — above-average school zone' };
  }
  if (sScore >= 40 && detached >= 60) {
    return { verdict: 'maybe', reason: 'Moderate schools + ' + detached + '% detached homes' };
  }
  return { verdict: 'no', reason: 'Limited school data or below-average zones' };
}
```

### First Home Buyers

```javascript
function suitabilityFHB(data) {
  const med = data.median_house_price;
  const vScore = data.value?.score || 0;
  if (med && med < 600000) {
    return { verdict: 'yes', reason: 'Median $' + formatPrice(med) + ' — highly affordable entry' };
  }
  if (vScore >= 55 || (med && med < 850000)) {
    return { verdict: 'maybe', reason: 'Median $' + formatPrice(med) + ' — moderate, below Melbourne median' };
  }
  return { verdict: 'no', reason: 'Median $' + formatPrice(med) + ' — above $1.2M, beyond FHB range' };
}
```

---

## Implementation Plan

| Step | What | Where |
|------|------|-------|
| 1 | Add `buildSuitabilityHTML()` function | `public/trust-layer.js` |
| 2 | Add 4 investor classification functions | `public/trust-layer.js` |
| 3 | Add suitability CSS | `public/trust-layer.js` (inline) |
| 4 | Wire into `renderWithData()` — appends after Why Suburb card | `public/trust-layer.js` |
| 5 | Add i18n keys | `public/trust-layer.js` |
| 6 | Verify: no hardcoded suburbs, no backend changes | Manual check |
| 7 | Deploy to Vercel | `git push` |

---

## Verification Checklist

- [ ] No backend/API changes
- [ ] No new datasets
- [ ] No hardcoded suburb names
- [ ] Works with any suburb data from `/api/suburb-intelligence`
- [ ] Bilingual: English + 中文
- [ ] Mobile responsive
- [ ] ✅ ⚠️ ❌ labels are descriptive, not judgmental
