import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

// Capture ALL request data (POST body especially)
page.on('request', (req) => {
  const url = req.url();
  if (url.includes('tide') || url.includes('elastic') || url.includes('_search') || 
      url.includes('arcgis') || url.includes('FeatureServer') || url.includes('query?')) {
    const pd = req.postData();
    console.log(`\n[REQ] ${req.method()} ${url}`);
    if (pd) console.log('Body:', pd.substring(0,3000));
  }
});

page.on('response', async (r) => {
  const url = r.url();
  try {
    const ct = (r.headers()['content-type']||'');
    if (url.includes('tide') || url.includes('elastic') || url.includes('_search') ||
        (url.includes('arcgis') && ct.includes('json')) ||
        url.includes('go.vic.gov.au') || url.includes('api.vic') || url.includes('discover.data')) {
      
      const body = await r.text();
      console.log(`\n[RES ${r.status()}] ${url}`);
      
      // Check for indicator data
      const terms = ['population','rate_income','debt_to','satisf','operating','surplus','renewal','infrastructure','community','revenue','income','indicator','snapshot','website','email','phone'];
      const found = terms.filter(t => body.toLowerCase().includes(t));
      if (found.length > 0) console.log('>>> FOUND: ' + found.join(', '));
      
      if (body.length < 5000) {
        console.log(body.substring(0,3000));
      } else {
        // Just show first 200 chars and check if any of our terms are found
        console.log('Body length:', body.length);
        console.log(body.substring(0,300));
        console.log('...');
        console.log(body.substring(body.length-200));
      }
    }
  } catch(e) {}
});

// Load the comparison dashboard
console.log('Loading comparison dashboard...');
await page.goto('https://www.vic.gov.au/know-your-council-comparison-dashboard', {
  waitUntil: 'networkidle2',
  timeout: 60000
});
await new Promise(r => setTimeout(r, 3000));

// Now let's try to select "List" view, then search for "Melbourne City" council
console.log('\n--- Clicking "List" tab ---');
await page.evaluate(() => {
  const buttons = document.querySelectorAll('button');
  for (const b of buttons) {
    if (b.textContent.toLowerCase().includes('list')) { b.click(); return; }
  }
});
await new Promise(r => setTimeout(r, 3000));

// Now try to type "Melbourne" in the search box
console.log('\n--- Typing "Melbourne" in search ---');
await page.evaluate(() => {
  const inputs = document.querySelectorAll('input');
  for (const inp of inputs) {
    console.log('Input:', inp.placeholder, inp.type, inp.id, inp.className);
    if (inp.type === 'search' || (inp.placeholder && inp.placeholder.toLowerCase().includes('suburb'))) {
      inp.focus();
      inp.value = 'Melbourne City';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
  }
});
await new Promise(r => setTimeout(r, 3000));

// Take screenshot to see what happened
await page.screenshot({path: '/tmp/kyc-list-view.png'});
console.log('Screenshot saved.');

// Try clicking on the first result in the list
console.log('\n--- Looking for list items ---');
const listContent = await page.evaluate(() => {
  const visible = document.body.innerText;
  const lines = visible.split('\n').filter(l => l.trim());
  // Find any lines that look like council entries
  const councilLines = lines.filter(l => 
    /[A-Z]/.test(l.charAt(0)) && !l.includes('Menu') && l.length > 5
  );
  return {
    totalLines: lines.length,
    first100: lines.slice(0,100),
    councilDataLines: councilLines.slice(0,20)
  };
});
console.log(JSON.stringify(listContent, null, 2));

// Also check if any data-loaded elements appeared
const hasData = await page.evaluate(() => {
  return {
    mainContent: document.querySelector('[class*="content"], main, article')?.innerText?.substring(0,500),
    anyHighlighted: document.querySelector('[class*="highlight"], [class*="selected"], [class*="active"]')?.textContent?.trim(),
    mapContainer: document.querySelector('[class*="map"], [class*="Map"]') !== null
  };
});
console.log('\nPage state:', JSON.stringify(hasData, null, 2));

await browser.close();
