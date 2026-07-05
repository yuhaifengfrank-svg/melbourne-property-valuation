import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

// Capture the Power BI API session info
let resourceKey = null;
let clusterUrl = null;
let apiHeaders = null;

page.on('request', (req) => {
  const url = req.url();
  if (url.includes('querydata') && url.includes('synchronous')) {
    const h = req.headers();
    apiHeaders = {
      'accept': h['accept'],
      'content-type': h['content-type'],
      'origin': h['origin'],
      'referer': h['referer'],
      'x-powerbi-resourcekey': h['x-powerbi-resourcekey'],
      'activityid': h['activityid'],
      'requestid': h['requestid'],
      'user-agent': h['user-agent'],
    };
    if (h['x-powerbi-resourcekey']) resourceKey = h['x-powerbi-resourcekey'];
    clusterUrl = url;
  }
});

await page.goto('https://www.vic.gov.au/know-your-council-comparison-dashboard', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 5000));

console.log('=== Captured API Info ===');
console.log('clusterUrl:', clusterUrl);
console.log('resourceKey:', resourceKey);
console.log('apiHeaders:', JSON.stringify(apiHeaders, null, 2));

if (clusterUrl && apiHeaders && resourceKey) {
  // Save for later use
  fs.writeFileSync('/tmp/pbi-session.json', JSON.stringify({
    clusterUrl,
    resourceKey,
    headers: apiHeaders
  }, null, 2));
  console.log('\nSaved to /tmp/pbi-session.json');
  
  // Now let's try querying for ALL councils for Financial Performance
  // The Power BI data model uses Dim_Indicators and Fact_Results tables
  
  // Query 1: Get all councils
  const query1 = {
    "version": "1.0.0",
    "queries": [{
      "Query": {
        "Commands": [{
          "SemanticQueryDataShapeCommand": {
            "Query": {
              "Version": 2,
              "From": [{"Name": "e", "Entity": "Dim_Councils"}],
              "Select": [
                {"Column": {"Expression": {"SourceRef": {"Source": "e"}}, "Property": "Council Name"}, "Name": "Dim_Councils.Council Name"}
              ]
            }
          }
        }]
      },
      "CacheKey": "all-councils"
    }]
  };
  
  // Post the query directly through the page
  const result = await page.evaluate(async (url, headers, query) => {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(query)
      });
      const data = await resp.text();
      return {status: resp.status, data: data.substring(0, 5000)};
    } catch(e) {
      return {error: e.message};
    }
  }, clusterUrl, {
    'accept': apiHeaders['accept'],
    'content-type': 'application/json;charset=UTF-8',
    'x-powerbi-resourcekey': apiHeaders['x-powerbi-resourcekey'],
    'activityid': apiHeaders['activityid'],
    'requestid': apiHeaders['requestid'],
  }, query1);
  
  console.log('\nQuery result:', JSON.stringify(result, null, 2));
}

await browser.close();
