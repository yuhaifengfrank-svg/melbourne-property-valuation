import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

let responses = [];

// Capture ALL responses from PBI API
page.on('response', async (r) => {
  const url = r.url();
  if (url.includes('wabi') && (url.includes('querydata') || url.includes('models'))) {
    try {
      const body = await r.text();
      responses.push({url: url.substring(0, 200), status: r.status(), body});
    } catch(e) {}
  }
});

await page.goto('https://app.powerbi.com/view?r=eyJrIjoiMDJkY2RkN2MtZDFiMS00ODM3LWE2MjMtZDczYWJiNDZlMzM4IiwidCI6IjcyMmVhMGJlLTNlMWMtNGIxMS1hZDZmLTk0MDFkNjg1NmUyNCJ9', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 8000));

console.log(`Captured ${responses.length} responses`);

// Save all responses  
fs.mkdirSync('/tmp/pbi-resp', {recursive: true});
for (let i = 0; i < responses.length; i++) {
  const r = responses[i];
  const fname = `/tmp/pbi-resp/response-${i}.json`;
  const data = {url: r.url, status: r.status, bodyLength: r.body.length};
  try {
    const parsed = JSON.parse(r.body);
    data['parsedSample'] = JSON.stringify(parsed).substring(0, 5000);
  } catch(e) {
    data['bodyPreview'] = r.body.substring(0, 500);
  }
  fs.writeFileSync(fname, JSON.stringify(data, null, 2));
  console.log(`Response #${i}: ${r.status} ${r.url.substring(0, 100)} (${r.body.length} bytes)`);
}

// Now use the page to perform a query for ALL data via XMLHttpRequest
console.log('\n=== Querying all indicator data via XMLHttpRequest from within the page ===');
const result = await page.evaluate(async () => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = 'https://wabi-australia-southeast-api.analysis.windows.net/public/reports/querydata?synchronous=true';
    
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('x-powerbi-resourcekey', '02dcdd7c-d1b1-4837-a623-d73abb46e338');
    xhr.withCredentials = true;
    
    xhr.onload = function() {
      resolve({status: xhr.status, body: xhr.responseText.substring(0, 10000)});
    };
    xhr.onerror = function() {
      resolve({error: 'XHR failed', status: xhr.status});
    };
    
    const query = {
      "version": "1.0.0",
      "queries": [{
        "Query": {
          "Commands": [{
            "SemanticQueryDataShapeCommand": {
              "Query": {
                "Version": 2,
                "From": [
                  {"Name": "f", "Entity": "Fact_Results", "Type": 1},
                  {"Name": "d", "Entity": "Dim_Councils", "Type": 0},
                  {"Name": "d1", "Entity": "Dim_Indicators", "Type": 0}
                ],
                "Select": [
                  {"Column": {"Expression": {"SourceRef": {"Source": "d"}}, "Property": "Council"}, "Name": "Council"},
                  {"Column": {"Expression": {"SourceRef": {"Source": "d1"}}, "Property": "Measurement Name"}, "Name": "Measurement Name"},
                  {"Column": {"Expression": {"SourceRef": {"Source": "d1"}}, "Property": "Service Area Name"}, "Name": "Service Area Name"},
                  {"Column": {"Expression": {"SourceRef": {"Source": "f"}}, "Property": "Financial year"}, "Name": "Financial year"},
                  {"Measure": {"Expression": {"SourceRef": {"Source": "f"}}, "Property": "Measure_result"}, "Name": "Measure_result"},
                  {"Measure": {"Expression": {"SourceRef": {"Source": "f"}}, "Property": "Measure_allCouncilAverage"}, "Name": "Measure_allCouncilAverage"},
                  {"Measure": {"Expression": {"SourceRef": {"Source": "f"}}, "Property": "Measure_selectedCouncil"}, "Name": "Measure_selectedCouncil"},
                  {"Measure": {"Expression": {"SourceRef": {"Source": "f"}}, "Property": "Measure_CouncilTarget"}, "Name": "Measure_CouncilTarget"}
                ]
              },
              "Binding": {
                "DataReduction": {
                  "Primary": {"TopN": 50000, "Count": 50000}
                }
              }
            }
          }]
        }
      }]
    };
    
    xhr.send(JSON.stringify(query));
  });
});

console.log('XHR result:', JSON.stringify(result).substring(0, 5000));

if (result.body) {
  fs.writeFileSync('/tmp/pbi-xhr-result.json', result.body);
  console.log('Saved to /tmp/pbi-xhr-result.json');
}

await browser.close();
