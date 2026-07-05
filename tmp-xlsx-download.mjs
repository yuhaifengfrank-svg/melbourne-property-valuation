import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true, args: ['--no-sandbox','--disable-web-security']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

// Set a proper user-agent
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');

const xlsxUrl = 'https://www.localgovernment.vic.gov.au/__data/assets/excel_doc/0019/191008/LGPRF-2020-2025-Full-Council-Data-Set-Nov25-Final-Release.xlsx';

// First try: direct download
console.log('Direct download attempt via Puppeteer...');
page.on('response', async (r) => {
  if (r.url().includes('xlsx') || r.url().includes('excel_doc')) {
    console.log('XLSX response:', r.status(), r.url());
    try {
      const buffer = await r.buffer();
      console.log('Buffer size:', buffer.length);
      
      // Check if it's actually XLSX or HTML (Cloudflare challenge)
      const contentType = r.headers()['content-type'] || '';
      if (buffer.length > 10000 && (contentType.includes('excel') || contentType.includes('octet') || contentType.includes('application/vnd'))) {
        fs.writeFileSync('/tmp/kyc-lgprf-puppeteer.xlsx', buffer);
        console.log('SAVED successfully to /tmp/kyc-lgprf-puppeteer.xlsx');
      } else if (buffer.length < 10000) {
        console.log('Small response - likely Cloudflare challenge:', buffer.toString('utf-8').substring(0, 300));
      } else {
        console.log('Content: ' + buffer.toString('utf-8').substring(0, 500));
      }
    } catch(e) {
      console.log('Error reading:', e.message);
    }
  }
});

// Navigate directly to the XLSX URL
await page.goto(xlsxUrl, {waitUntil: 'networkidle2', timeout: 60000});
await new Promise(r => setTimeout(r, 3000));

// Also try the CKAN mirror
console.log('\nTrying CKAN mirror...');
const ckanUrl = 'https://discover.data.vic.gov.au/dataset/41076ac6-b70a-4ba1-8143-38227c275e78/resource/362b34b3-9ff4-4c64-8d5b-377abf2e0d0e/download/lgprf-full-data-set-2020-25.xlsx';
await page.goto(ckanUrl, {waitUntil: 'networkidle2', timeout: 60000});
await new Promise(r => setTimeout(r, 3000));

await browser.close();
console.log('\nDone.');
