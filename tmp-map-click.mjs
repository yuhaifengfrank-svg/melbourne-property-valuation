import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

let seenUrls = new Set();

page.on('response', async (r) => {
  const url = r.url();
  try {
    const ct = (r.headers()['content-type']||'');
    // Only look at data-bearing endpoints
    if (url.includes('tide') || url.includes('elastic') || url.includes('_search') || 
        (url.includes('arcgis') && (url.includes('query') || url.includes('FeatureServer')))) {
      
      if (seenUrls.has(url)) return;
      seenUrls.add(url);
      
      const body = await r.text();
      console.log('\n=== NEW RESPONSE: ' + r.status() + ' ' + r.request().method() + ' ' + url + ' ===');
      
      // Check for indicator data in the response
      const searchTerms = ['population', 'rate_income', 'rate_', 'debt_to', 'satisf', 'operating', 'surplus', 'renewal', 'infrastructure', 'community', 'revenue', 'expense', 'income', 'score', 'indicator', 'budget', 'per_capita', 'website', 'email', 'phone', 'address', 'snapshot'];
      const found = searchTerms.filter(t => body.toLowerCase().includes(t));
      if (found.length > 0) {
        console.log('FOUND INDICATOR DATA: ' + found.join(', '));
      }
      
      if (body.length < 10000) {
        console.log(body.substring(0, 2000));
      } else if (found.length > 0) {
        // Show the context around each found term
        for (const term of found) {
          const idx = body.toLowerCase().indexOf(term);
          console.log('  [' + term + ']: ' + body.substring(Math.max(0, idx-30), idx+200));
        }
      } else {
        console.log('Length: ' + body.length + ' - first 200: ' + body.substring(0, 200));
      }
    }
  } catch(e) {}
});

// Wait for map to load
await page.goto('https://www.knowyourcouncil.vic.gov.au/', {waitUntil:'networkidle2',timeout:60000});
await new Promise(r => setTimeout(r, 3000));

// Click on "Melbourne City" on the map to trigger its popup
// First find map element and click its center
try {
  const mapEl = await page.$('canvas, [class*="leaflet"], [class*="mapbox"], [class*="map"]');
  if (mapEl) {
    const box = await mapEl.boundingBox();
    if (box) {
      // Click center of map
      console.log('\nClicking map at center');
      await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
      await new Promise(r => setTimeout(r, 5000));
      
      // Try zooming out first then clicking
      console.log('Double-clicking map');
      await page.mouse.click(box.x + box.width/2, box.y + box.height/2, {clickCount: 2});
      await new Promise(r => setTimeout(r, 3000));
    }
  }
} catch(e) {
  console.log('Map click error: ' + e.message);
}

// Also try using the address search bar to select "Melbourne City" LGA
console.log('\nUsing search...');
try {
  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder*="suburb"]');
    if (input) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      nativeSetter.set.call(input, 'Melbourne');
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }
  });
  await new Promise(r => setTimeout(r, 5000));
  
  // Look for autocomplete suggestions/results
  await page.evaluate(() => {
    // Try clicking on the first result
    const results = document.querySelectorAll('li, [class*="suggestion"], [class*="result"], [class*="autocomplete"]');
    for (const r of results) {
      if (r.textContent.toLowerCase().includes('melbourne') && r.textContent.toLowerCase().includes('city')) {
        console.log('Clicking result: ' + r.textContent);
        r.click();
        return;
      }
    }
  });
  await new Promise(r => setTimeout(r, 5000));
} catch(e) {
  console.log('Search error: ' + e.message);
}

console.log('\n=== Session complete ===');
await browser.close();
