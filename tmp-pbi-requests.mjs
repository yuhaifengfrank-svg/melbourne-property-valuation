import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

let allRequests = [];

page.on('request', (req) => {
  const url = req.url();
  if (url.includes('wabi-australia-southeast') && url.includes('querydata')) {
    const headers = req.headers();
    const pd = req.postData();
    allRequests.push({
      url,
      method: req.method(),
      headers: {
        'accept': headers['accept'],
        'content-type': headers['content-type'],
        'origin': headers['origin'],
        'referer': headers['referer'],
        'user-agent': headers['user-agent'],
        'x-powerbi-resourcekey': headers['x-powerbi-resourcekey'],
        'activityid': headers['activityid'],
        'requestid': headers['requestid'],
      },
      body: pd ? JSON.parse(pd) : null
    });
  }
});

await page.goto('https://www.vic.gov.au/know-your-council-comparison-dashboard', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 5000));

// Now find and try to click "Financial Performance" to get real financial data
await page.evaluate(() => {
  const iframe = document.querySelector('iframe');
  if (iframe) {
    try {
      // Try to send a postMessage to the Power BI iframe to switch service area
      iframe.contentWindow.postMessage(JSON.stringify({
        action: 'setPage',
        pageName: 'ReportSection'
      }), '*');
    } catch(e) {}
  }
});

// Wait for more queries to fire
await new Promise(r => setTimeout(r, 5000));

console.log(JSON.stringify(allRequests, null, 2));
console.log('\nTotal queries captured:', allRequests.length);

// Also dump the key info for replay
if (allRequests.length > 0) {
  const sample = allRequests[0];
  console.log('\n=== Replay info ===');
  console.log('URL:', sample.url);
  console.log('Headers:', JSON.stringify(sample.headers, null, 2));
  if (sample.body) {
    console.log('Sample body keys:', Object.keys(sample.body));
  }
}

await browser.close();
