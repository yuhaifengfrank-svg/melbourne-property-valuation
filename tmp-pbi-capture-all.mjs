import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

// Capture all request data including POST bodies
let capturedRequests = [];
page.on('request', (req) => {
  const url = req.url();
  if (url.includes('querydata') && url.includes('synchronous')) {
    const pd = req.postData();
    capturedRequests.push({
      url,
      method: req.method(),
      headers: req.headers(),
      body: pd ? JSON.parse(pd) : null
    });
  }
});

// Load the PBI directly  
await page.goto('https://app.powerbi.com/view?r=eyJrIjoiMDJkY2RkN2MtZDFiMS00ODM3LWE2MjMtZDczYWJiNDZlMzM4IiwidCI6IjcyMmVhMGJlLTNlMWMtNGIxMS1hZDZmLTk0MDFkNjg1NmUyNCJ9', {
  waitUntil: 'networkidle2',
  timeout: 60000
});
await new Promise(r => setTimeout(r, 8000));

console.log('Captured ' + capturedRequests.length + ' requests');

// Check the PBI page for the resource key
const pageInfo = await page.evaluate(() => {
  const results = {};
  
  // The resource key is on window
  if (window.resourceKey) results['resourceKey'] = window.resourceKey;
  if (window.powerBIResourceKey) results['powerBIResourceKey'] = window.powerBIResourceKey;
  
  // Also check the config for any API info
  if (window.reportEmbed) {
    results['reportEmbedKeys'] = Object.keys(window.reportEmbed).filter(k => !k.startsWith('_')).slice(0, 20);
  }
  
  // Check resourceLoaderUrl
  if (window.resourceLoaderUrl) results['resourceLoaderUrl'] = window.resourceLoaderUrl.substring(0, 200);
  
  // Check resourceDescriptor
  if (window.resourceDescriptor) {
    results['resourceDescriptorType'] = typeof window.resourceDescriptor;
    try {
      results['resourceDescriptor'] = JSON.stringify(window.resourceDescriptor).substring(0, 500);
    } catch(e) {}
  }
  
  // Check loadReport function for config
  try {
    if (window.loadReport) {
      results['loadReportType'] = typeof window.loadReport;
    }
  } catch(e) {}
  
  // Check window.__config__
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key.startsWith('__') || key.startsWith('pbi') || key.startsWith('_power')) {
      results['prop_' + key] = typeof window[key];
    }
  }
  
  return results;
});

console.log('\nPage info:', JSON.stringify(pageInfo, null, 2));

// Save captured queries for analysis
const queryInfo = capturedRequests.map(req => ({
  url: req.url,
  method: req.method,
  headers: {
    'content-type': req.headers['content-type'],
    'accept': req.headers['accept'],
    'origin': req.headers['origin'],
    'referer': req.headers['referer'],
    'x-powerbi-resourcekey': req.headers['x-powerbi-resourcekey'],
    'activityid': req.headers['activityid'],
    'requestid': req.headers['requestid'],
    'cookie': req.headers['cookie'] ? req.headers['cookie'].substring(0, 200) : null,
  },
  body: req.body
}));

// Also save the full request info including cookies
fs.writeFileSync('/tmp/pbi-captured.json', JSON.stringify(capturedRequests.map(r => ({
  url: r.url,
  method: r.method,
  headers: {
    ...r.headers,
    'cookie': r.headers['cookie'] ? r.headers['cookie'].substring(0,300) : null
  },
  body: r.body
})), null, 2));

console.log('\nSaved ' + capturedRequests.length + ' captured requests');

await browser.close();
