import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

// Prepare to capture session info
let clusterUrl = null;
let pbiHeaders = null;
let allResponses = [];

page.on('response', async (r) => {
  const url = r.url();
  try {
    if (url.includes('querydata') && url.includes('synchronous')) {
      const body = await r.text();
      const ct = (r.headers()['content-type']||'');
      if (ct.includes('json')) {
        allResponses.push({url, body, status: r.status()});
      }
    }
  } catch(e) {}
});

page.on('request', (req) => {
  if (!clusterUrl) {
    const url = req.url();
    if (url.includes('querydata') && url.includes('synchronous')) {
      clusterUrl = url;
      const h = req.headers();
      pbiHeaders = {
        'accept': h['accept'],
        'content-type': h['content-type'],
        'origin': h['origin'],
        'referer': h['referer'],
        'x-powerbi-resourcekey': h['x-powerbi-resourcekey'],
        'activityid': h['activityid'],
        'requestid': h['requestid'],
      };
    }
  }
});

// Load the Power BI report and wait for it to initialize
console.log('Loading Power BI report...');
await page.goto('https://app.powerbi.com/view?r=eyJrIjoiMDJkY2RkN2MtZDFiMS00ODM3LWE2MjMtZDczYWJiNDZlMzM4IiwidCI6IjcyMmVhMGJlLTNlMWMtNGIxMS1hZDZmLTk0MDFkNjg1NmUyNCJ9', {
  waitUntil: 'networkidle2',
  timeout: 60000
});
await new Promise(r => setTimeout(r, 8000));

console.log('Session captured:');
console.log('clusterUrl:', clusterUrl);
console.log('headers:', JSON.stringify(pbiHeaders, null, 2));

// Now let's query all councils and all indicators through the page's JS context
// This way we bypass CORS issues

// First, get the list of councils
console.log('\n=== Fetching all councils ===');
const allCouncilsQuery = {
  "version": "1.0.0",
  "queries": [{
    "Query": {
      "Commands": [{
        "SemanticQueryDataShapeCommand": {
          "Query": {
            "Version": 2,
            "From": [
              {"Name": "d", "Entity": "Dim_Councils", "Type": 0}
            ],
            "Select": [
              {
                "Column": {
                  "Expression": {"SourceRef": {"Source": "d"}},
                  "Property": "Council"
                },
                "Name": "Council"
              }
            ]
          }
        }
      }]
    }
  }]
};

const councilResult = await page.evaluate(async (url, headers, query) => {
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(query)
    });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch(e) {
    return JSON.stringify({error: e.message});
  }
}, clusterUrl, pbiHeaders, allCouncilsQuery);

console.log('Councils result:', councilResult.substring(0, 2000));

// Get all indicator names
console.log('\n=== Fetching all indicators ===');
const allIndicatorsQuery = {
  "version": "1.0.0",
  "queries": [{
    "Query": {
      "Commands": [{
        "SemanticQueryDataShapeCommand": {
          "Query": {
            "Version": 2,
            "From": [
              {"Name": "d", "Entity": "Dim_Indicators", "Type": 0}
            ],
            "Select": [
              {
                "Column": {
                  "Expression": {"SourceRef": {"Source": "d"}},
                  "Property": "Measurement Name"
                },
                "Name": "Measurement Name"
              },
              {
                "Column": {
                  "Expression": {"SourceRef": {"Source": "d"}},
                  "Property": "Service Area Name"
                },
                "Name": "Service Area Name"
              },
              {
                "Column": {
                  "Expression": {"SourceRef": {"Source": "d"}},
                  "Property": "Measurement Description"
                },
                "Name": "Measurement Description"
              }
            ]
          }
        }
      }]
    }
  }]
};

const indResult = await page.evaluate(async (url, headers, query) => {
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(query)
    });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch(e) {
    return JSON.stringify({error: e.message});
  }
}, clusterUrl, pbiHeaders, allIndicatorsQuery);

console.log('Indicators result:', indResult.substring(0, 5000));

// Now query for ALL data: all councils x all indicators x all years
// This is the big query we really need
console.log('\n=== Fetching all fact data ===');
const allDataQuery = {
  "version": "1.0.0",
  "queries": [{
    "Query": {
      "Commands": [{
        "SemanticQueryDataShapeCommand": {
          "Binding": {
            "DataReduction": {
              "Primary": {"TopN": 10000, "Count": 10000}
            }
          },
          "Query": {
            "Version": 2,
            "From": [
              {"Name": "f", "Entity": "Fact_Results", "Type": 1},
              {"Name": "d", "Entity": "Dim_Councils", "Type": 0},
              {"Name": "d1", "Entity": "Dim_Indicators", "Type": 0}
            ],
            "Select": [
              {
                "Column": {
                  "Expression": {"SourceRef": {"Source": "d"}},
                  "Property": "Council"
                },
                "Name": "Council"
              },
              {
                "Column": {
                  "Expression": {"SourceRef": {"Source": "d1"}},
                  "Property": "Measurement Name"
                },
                "Name": "Measurement Name"
              },
              {
                "Column": {
                  "Expression": {"SourceRef": {"Source": "f"}},
                  "Property": "Financial year"
                },
                "Name": "Financial year"
              },
              {
                "Measure": {
                  "Expression": {"SourceRef": {"Source": "f"}},
                  "Property": "Measure_result"
                },
                "Name": "Measure_result"
              },
              {
                "Measure": {
                  "Expression": {"SourceRef": {"Source": "f"}},
                  "Property": "Measure_allCouncilAverage"
                },
                "Name": "Measure_allCouncilAverage"
              },
              {
                "Measure": {
                  "Expression": {"SourceRef": {"Source": "f"}},
                  "Property": "Measure_selectedCouncil"
                },
                "Name": "Measure_selectedCouncil"
              },
              {
                "Measure": {
                  "Expression": {"SourceRef": {"Source": "f"}},
                  "Property": "Measure_CouncilTarget"
                },
                "Name": "Measure_CouncilTarget"
              }
            ]
          }
        }
      }]
    }
  }]
};

const dataResult = await page.evaluate(async (url, headers, query) => {
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(query)
    });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch(e) {
    return JSON.stringify({error: e.message});
  }
}, clusterUrl, pbiHeaders, allDataQuery);

console.log('All data result length:', dataResult.length);
fs.writeFileSync('/tmp/pbi-all-data.json', dataResult);
console.log('Saved to /tmp/pbi-all-data.json');

// Also save session info
fs.writeFileSync('/tmp/pbi-session.json', JSON.stringify({
  clusterUrl, headers: pbiHeaders
}, null, 2));

await browser.close();
console.log('\nDone.');
