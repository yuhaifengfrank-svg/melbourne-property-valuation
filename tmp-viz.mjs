import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

let allResponses = [];

page.on('response', async (r) => {
  try {
    const url = r.url();
    const ct = (r.headers()['content-type']||'');
    if (url.includes('google') || url.includes('analytics') || url.includes('clarity') || url.includes('manifest')) return;
    if (!ct.includes('json') && !url.includes('arcgis') && !url.includes('FeatureServer')) return;
    
    const body = await r.text();
    allResponses.push({url, status: r.status(), body, ct});
  } catch(e) {}
});

console.log('Loading KYC...');
await page.goto('https://www.knowyourcouncil.vic.gov.au/', {waitUntil:'networkidle2',timeout:60000});
await new Promise(r => setTimeout(r, 3000));

// Click the list tab
await page.evaluate(() => {
  const buttons = document.querySelectorAll('button');
  for (const b of buttons) {
    if (b.textContent.toLowerCase().includes('list')) { b.click(); return; }
  }
});
await new Promise(r => setTimeout(r, 3000));

// Now take a screenshot to see what's rendered
await page.screenshot({path: '/tmp/kyc-screenshot.png', fullPage: true});

// Check if there are ArcGIS FeatureServer calls that contain indicator data
for (const resp of allResponses) {
  if (resp.url.includes('FeatureServer') || resp.url.includes('arcgis') || resp.url.includes('query')) {
    console.log('\nArcGIS: ' + resp.url);
    console.log('Body (600): ' + resp.body.substring(0, 600));
  }
}

// Also check the rendered DOM more carefully
const visible = await page.evaluate(() => {
  const text = document.body.innerText;
  const lines = text.split('\n').filter(l => l.trim());
  
  // Look for numerical data patterns
  const results = {};
  results['totalLines'] = lines.length;
  
  // Find patterns like "$XX.XX" or "XX%" or number ranges
  const dollarMatches = text.match(/\$[\d,]+\.?\d*/g);
  if (dollarMatches) results['dollarValues'] = dollarMatches.slice(0, 20);
  
  const percentMatches = text.match(/\d+\.?\d*%/g);
  if (percentMatches) results['percentValues'] = percentMatches.slice(0, 20);
  
  // Find rows with council names and values
  const councilLines = lines.filter(l => 
    /[A-Z]/.test(l.charAt(0)) && /\d/.test(l)
  ).slice(0, 15);
  results['councilDataLines'] = councilLines;
  
  // List all buttons for navigation
  results['allButtons'] = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t);
  
  return results;
});

console.log('\nVisible page content analysis:');
console.log(JSON.stringify(visible, null, 2));

// Check for loading states
const loading = await page.evaluate(() => {
  return {
    spinner: document.querySelector('[class*="spinner"], [class*="loading"], [class*="Loader"]'),
    skeleton: document.querySelector('[class*="skeleton"], [class*="Skeleton"]'),
    error: document.body.innerText.includes('error') || document.body.innerText.includes('Error'),
    noResults: document.body.innerText.includes('No results') || document.body.innerText.includes('no results'),
    map: document.querySelector('[class*="map"], [class*="Map"], #map')
  };
});
console.log('\nLoading states:', JSON.stringify(loading));

await browser.close();
console.log('\nDone');
