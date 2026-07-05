/**
 * scripts/fetch-vba-permit-data.mjs
 *
 * Fetch VBA/BPC Building Permit Monthly Summary XLSX files from Data.Vic.
 *
 * The VBA site uses Cloudflare protection, so direct curl fails.
 * Strategy: via Data.Vic CKAN API, try to get the latest files.
 *
 * Fallback: If Cloudflare blocks, provide manual download URLs.
 *
 * Latest structure: Each XLSX has sheets per-LGA with:
 *   - Municipality (LGA name)
 *   - New houses (count + value)
 *   - New townhouses/flats (count + value)
 *   - Alterations/additions (count + value)
 *   - Commercial/industrial (count + value)
 *   - Total (count + value)
 *
 * Run: node scripts/fetch-vba-permit-data.mjs [--year 2026]
 *
 * Output: /tmp/vba-data/YYYY-MM.xlsx files
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

const OUTPUT_DIR = '/tmp/vba-data';

// All 128 resources for the dataset
// Updated list from CKAN package_show
const RESOURCE_IDS = {
  '2026-03': '77cad934-d691-452f-9f7f-bd38adb05a46',
  '2026-02': 'c225305b-90de-4952-96d5-0a6887bb7ab0',
  '2026-01': '7d51998f-b2c0-44d0-a85b-9cf4eff57358',
  '2025-12': 'dff75b03-e7e0-40a3-b96d-56e10b9bbaf7',
  '2025-11': '5d24bf0d-ba2f-419a-81bd-e55a26520e29',
  '2025-10': 'a71e8ce6-12e7-4751-9b60-d2d8ee613003',
  '2025-09': '7f4c7fec-ba46-49cd-b5f7-66c6f0e521a8',
  '2025-08': 'b019700b-9730-4c5e-9007-9296ad524195',
  '2025-07': '63823f93-b2a3-4e21-b6a3-118e41073a9b',
  '2025-06': 'a2e6e82d-2359-4e95-b61e-9f4520263d8f',
  '2025-05': '91a1d8de-c336-4628-9a85-68b88fd121cc',
  '2025-04': '62bbf4a3-ad7b-49de-95a6-be5bcd0e78ae',
  '2025-03': 'c8422176-8c89-4308-ad5e-9f4edfe19495',
  // ... more months available from CKAN
};

// Direct download URLs (from CKAN resource_url, behind Cloudflare)
const DIRECT_URLS = {
  '2026-03': 'https://www.vba.vic.gov.au/_resources/documents/data/permit-summaries/2026/20260763-Internal-Imica-Aurora-TL.XLSX',
  '2026-02': 'https://www.vba.vic.gov.au/_resources/documents/data/permit-summaries/2026/Building-Activity-Summary-Feb_2026.XLSX',
  '2026-01': 'https://www.vba.vic.gov.au/_resources/documents/data/permit-summaries/2026/20260299-Internal.xlsx',
  '2025-12': 'https://www.vba.vic.gov.au/_resources/documents/data/permit-summaries/2025/20260079-Internal-Imica-Aurora-TL.XLSX',
  '2025-11': 'https://www.vba.vic.gov.au/_resources/documents/data/permit-summaries/2025/20252296-Internal-Imica-Aurora-TL.XLSX',
  '2025-10': 'https://www.vba.vic.gov.au/_resources/documents/data/permit-summaries/2025/Building-Permit-Activity-Summary-October.XLSX',
  '2025-09': 'https://www.vba.vic.gov.au/_resources/documents/data/permit-summaries/2025/20251898-Internal-Imica-Aurora-TL.XLSX',
  '2025-08': 'https://www.vba.vic.gov.au/_resources/documents/data/permit-summaries/2025/20251685-Internal-Imica-Aurora-TL.XLSX',
  '2025-07': 'https://www.vba.vic.gov.au/_resources/documents/data/permit-summaries/2025/20251496-Internal.xlsx',
  '2025-06': 'https://www.vba.vic.gov.au/_resources/documents/data/permit-summaries/2025/20251240-Internal-.xlsx',
  '2025-05': 'https://www.vba.vic.gov.au/_resources/documents/data/permit-summaries/2025/20251053-Internal.xlsx',
};

async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } }, (res) => {
      // Check if redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      
      // Check if blocked by Cloudflare
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} — likely Cloudflare block`));
        return;
      }
      
      const contentType = res.headers['content-type'] || '';
      if (contentType.includes('html')) {
        reject(new Error('HTML response — Cloudflare challenge page'));
        return;
      }
      
      const fileStream = fs.createWriteStream(outputPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(true);
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const targetKey = process.argv.find(a => a.startsWith('--year='))
    ?.split('=')[1] || null;
  
  const entries = targetKey
    ? Object.entries(DIRECT_URLS).filter(([k]) => k.startsWith(targetKey))
    : Object.entries(DIRECT_URLS);
  
  console.log(`[vba-fetch] Will try to download ${entries.length} files to ${OUTPUT_DIR}\n`);
  
  let success = 0;
  let failed = 0;
  
  for (const [month, url] of entries) {
    const outputPath = path.join(OUTPUT_DIR, `${month}.xlsx`);
    
    if (fs.existsSync(outputPath)) {
      console.log(`  ✓ ${month}: already exists (${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB)`);
      success++;
      continue;
    }
    
    process.stdout.write(`  ⟳ ${month}: downloading... `);
    try {
      await downloadFile(url, outputPath);
      const size = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
      
      if (size < 500) {
        // Too small for a real XLSX
        fs.unlinkSync(outputPath);
        throw new Error(`File too small: ${size} bytes`);
      }
      
      console.log(`✓ (${(size / 1024).toFixed(0)} KB)`);
      success++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
    
    // Be polite between downloads
    if (entries.length > 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`\n[vba-fetch] Results: ${success} success, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\nManual download URLs (due to Cloudflare protection):');
    for (const [month, url] of entries) {
      const outputPath = path.join(OUTPUT_DIR, `${month}.xlsx`);
      if (!fs.existsSync(outputPath)) {
        console.log(`  ${month}: ${url}`);
      }
    }
    console.log(`\nTo manually download, open these URLs in a browser (saves as XLSX)`);
    console.log(`Then copy to: ${OUTPUT_DIR}/`);
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('[vba-fetch] Fatal:', err.message);
  process.exit(1);
});
