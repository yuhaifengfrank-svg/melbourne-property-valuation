#!/bin/bash
# add-ga-faq-schema.sh
# 批量给所有 HTML 页面插入 Google Analytics gtag + FAQ Schema（suburb 页）
set -e

PUBLIC="/Users/FrankAI/Documents/澳洲房地产评估系统/public"
GA_ID="G-NNTEF17PH3"

# 要插入 GA 的页面（全部 HTML，排除 snippet）
echo "=== Step 1: Add Google Analytics to all HTML pages ==="

GA_SNIPPET='  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id='"$GA_ID"'"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag("js", new Date());
    gtag("config", "'"$GA_ID"'");
  </script>'

GA_INSERT_AFTER='<meta name="google-site-verification"'

count=0
find "$PUBLIC" -name "*.html" -not -name "*-snippet*" | while read -r f; do
  # 检查是否已有 GA
  if grep -q "googletagmanager.*$GA_ID" "$f" 2>/dev/null; then
    continue
  fi
  # 在 <head> 内第一个 meta 后插入（在 google-site-verification 后面）
  sed -i '' "/$GA_INSERT_AFTER/a\\
$GA_SNIPPET
" "$f"
  count=$((count + 1))
done

echo "Added GA to $count pages"
echo ""

echo "=== Step 2: Add FAQ Schema to suburb pages ==="
echo "Fetching median price data from DB..."

cd /Users/FrankAI/Documents/澳洲房地产评估系统
source .env.actual_db_bak

node --input-type=module << 'SCRIPT'
import { neon } from '@neondatabase/serverless';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const sql = neon(process.env.DATABASE_URL);
const PUBLIC = '/Users/FrankAI/Documents/澳洲房地产评估系统/public';

// 1. 从 suburb_metrics 取每个 suburb 的中位价
const rows = await sql`
  SELECT suburb, state, 
         median_house_price, median_unit_price,
         overall_score, growth_score, yield_score, school_score
  FROM suburb_metrics
  WHERE state = 'VIC'
    AND (median_house_price IS NOT NULL OR median_unit_price IS NOT NULL)
`;

console.log(`Loaded ${rows.length} suburbs with price data`);

let added = 0;
let skipped = 0;

for (const r of rows) {
  const suburbSlug = r.suburb.toLowerCase().replace(/ /g, '-');
  const filepath = join(PUBLIC, 'suburb', `${suburbSlug}-vic.html`);
  
  if (!existsSync(filepath)) {
    skipped++;
    continue;
  }

  let html = readFileSync(filepath, 'utf-8');

  // 如果已有 FAQ Schema 就跳过
  if (html.includes('"@type":"FAQPage"') || html.includes('"@type": "FAQPage"')) {
    skipped++;
    continue;
  }

  // 构造 3 个 FAQ
  const priceLine = r.median_house_price 
    ? `$${(r.median_house_price / 1000).toFixed(0)}k` 
    : `around $${r.median_unit_price ? (r.median_unit_price/1000).toFixed(0) + 'k' : 'varying prices'}`;

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": `What is the median house price in ${r.suburb}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `Based on our analysis, the median house price in ${r.suburb} is approximately ${priceLine} with an opportunity score of ${r.overall_score ?? 'N/A'}/100.`
        }
      },
      {
        "@type": "Question",
        "name": `Is ${r.suburb} a good suburb for property investment?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${r.suburb} scores ${r.overall_score ?? 'N/A'}/100 overall, with Growth ${r.growth_score ?? 'N/A'}, Yield ${r.yield_score ?? 'N/A'}, and School ${r.school_score ?? 'N/A'}. View the full factor breakdown on AusHomeValue for detailed investment analysis.`
        }
      },
      {
        "@type": "Question",
        "name": `How does ${r.suburb} compare to other Melbourne suburbs?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${r.suburb} is one of ${rows.length} Victorian suburbs tracked by AusHomeValue. Compare property prices, growth trends, school zones and investment scores across Melbourne suburbs using our free property intelligence tool.`
        }
      }
    ]
  };

  const faqJson = JSON.stringify(faq, null, 2);
  const faqBlock = `  <script type="application/ld+json">\n${faqJson}\n  </script>\n</head>`;

  // 在 </head> 前插入
  html = html.replace('</head>', faqBlock);

  writeFileSync(filepath, html, 'utf-8');
  added++;
}

console.log(`FAQ Schema added to ${added} suburb pages, skipped ${skipped}`);
SCRIPT

echo ""
echo "=== Step 3: Update sitemap with Research pages ==="
cd /Users/FrankAI/Documents/澳洲房地产评估系统
node scripts/generate-sitemap.cjs
echo "Sitemap regenerated."

echo ""
echo "=== Step 4: Verify ==="
echo "GA pages count:"
find "$PUBLIC" -name "*.html" -not -name "*-snippet*" -exec grep -l "$GA_ID" {} \; | wc -l | tr -d ' '
echo "FAQ pages count:"
find "$PUBLIC/suburb" -name "*.html" -exec grep -l "FAQPage" {} \; | wc -l | tr -d ' '
echo "Sitemap URLs:"
grep -c "<loc>" "$PUBLIC/sitemap.xml"
