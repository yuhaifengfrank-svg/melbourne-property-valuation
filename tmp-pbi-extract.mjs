import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

// Capture ALL requests to the Power BI API
page.on('request', (req) => {
  const url = req.url();
  if (url.includes('analysis.windows.net') || url.includes('powerbi') || url.includes('querydata') || url.includes('export')) {
    console.log(`\n[REQ] ${req.method()} ${url}`);
    const pd = req.postData();
    if (pd) {
      try {
        const parsed = JSON.parse(pd);
        console.log(JSON.stringify(parsed, null, 2).substring(0, 3000));
      } catch(e) {
        console.log('Raw:', pd.substring(0, 500));
      }
    }
  }
});

page.on('response', async (r) => {
  const url = r.url();
  try {
    if (url.includes('analysis.windows.net') || url.includes('powerbi')) {
      const ct = (r.headers()['content-type']||'');
      if (ct.includes('json') || url.includes('querydata')) {
        let body = '';
        try {
          body = await r.text();
        } catch(e) { body = '<body-error: ' + e.message + '>' }
        
        console.log(`\n[RES ${r.status()}] ${url}`);
        const trimmed = body.length > 3000 ? body.substring(0, 3000) + '... [total ' + body.length + ']' : body;
        console.log(trimmed);
      }
    }
  } catch(e) {}
});

// Load the KYC dashboard that contains the Power BI iframe
await page.goto('https://www.vic.gov.au/know-your-council-comparison-dashboard', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 5000));

// Wait for Power BI to fully render
console.log('\n\n=== Waiting for Power BI to initialize... ===');
await new Promise(r => setTimeout(r, 10000));

// Now try to access the Power BI iframe and extract data
console.log('Accessing Power BI iframe...');
const pbiData = await page.evaluate(() => {
  const iframe = document.querySelector('iframe');
  if (!iframe) return {error: 'no iframe found'};
  
  const src = iframe.src;
  const width = iframe.width || '';
  return {src, width, height: iframe.height || ''};
});
console.log('Power BI iframe:', JSON.stringify(pbiData));

// Wait a bit more for data to fully load
await new Promise(r => setTimeout(r, 5000));

// Try to interact with the Power BI iframe content
try {
  const frames = page.frames();
  for (const f of frames) {
    if (f.url().includes('powerbi.com')) {
      console.log('\n=== Found Power BI frame: ' + f.url().substring(0, 200) + ' ===');
      
      // Try to get visual data from the PBI frame
      const pbiText = await f.evaluate(() => {
        return document.body?.innerText?.substring(0, 3000) || 'no content';
      }).catch(e => 'Error: ' + e.message);
      console.log('PBI frame text:', pbiText);
      
      // Try to find the Power BI visual data
      const pbiVisuals = await f.evaluate(() => {
        const results = {};
        
        // Check for Power BI embedded data
        // Look for the session data
        if (window.powerbi) results['powerbi'] = Object.keys(window.powerbi);
        
        // Check for visual containers
        const visuals = document.querySelectorAll('[class*="visual"], [class*="Visual"], [class*="card"], [class*="Card"], [class*="dashboard"]');
        results['visualCount'] = visuals.length;
        results['visualTexts'] = Array.from(visuals).slice(0, 5).map(v => (v.textContent || '').trim().substring(0, 200));
        
        // Check for data-driven elements
        const dataCells = document.querySelectorAll('[class*="data"], [class*="value"], [class*="label"]');
        results['dataElCount'] = dataCells.length;
        results['sampleData'] = Array.from(dataCells).slice(0, 10).map(c => (c.textContent || '').trim().substring(0, 100));
        
        // Get all rendered text
        const bodyText = document.body?.innerText || '';
        results['totalChars'] = bodyText.length;
        
        // Look for financial patterns
        const dollar = bodyText.match(/\$[\d,]+\.?\d*/g);
        if (dollar) results['dollarSamples'] = dollar.slice(0, 15);
        
        const percent = bodyText.match(/\d+\.?\d*%/g);
        if (percent) results['percentSamples'] = percent.slice(0, 15);
        
        // Search for council names followed by data
        results['bodyTruncated'] = bodyText.substring(0, 5000);
        
        return results;
      }).catch(e => ({error: e.message}));
      
      console.log('PBI Visuals:', JSON.stringify(pbiVisuals, null, 2));
    }
  }
} catch(e) {
  console.log('Frame error: ' + e.message);
}

await browser.close();
