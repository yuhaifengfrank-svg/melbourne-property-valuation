import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

// Load the parent page (contains the PBI iframe)
await page.goto('https://www.vic.gov.au/know-your-council-comparison-dashboard', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 5000));

// Find the Power BI iframe
const frames = page.frames();
console.log('Frames:');
for (const f of frames) {
  if (f.url().includes('powerbi')) {
    console.log('Found PBI frame:', f.url().substring(0, 200));
    
    // Switch to the Power BI frame and run queries from there
    // (this should have the proper auth context)
    
    // First, get the resource key from the frame
    const fInfo = await f.evaluate(() => {
      // Look for the report embed config
      const results = {};
      
      // Check for config objects
      for (const key of Object.getOwnPropertyNames(window)) {
        if (key.toLowerCase().includes('config') || key.toLowerCase().includes('resource') || key.toLowerCase().includes('report') || key.toLowerCase().includes('embed')) {
          results[key] = typeof window[key];
        }
      }
      
      // Check session storage for tokens
      try {
        const session = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k.toLowerCase().includes('token') || k.toLowerCase().includes('access') || k.toLowerCase().includes('resource') || k.toLowerCase().includes('key')) {
            const v = sessionStorage.getItem(k);
            session[k] = v.substring(0, 100);
          }
        }
        results['sessionStorage'] = Object.keys(session).join(', ');
        
        // localStorage as well
        const local = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.toLowerCase().includes('token') || k.toLowerCase().includes('access') || k.toLowerCase().includes('resource') || k.toLowerCase().includes('key') || k.toLowerCase().includes('pbi') || k.toLowerCase().includes('powerbi')) {
            const v = localStorage.getItem(k);
            local[k] = v.substring(0, 80);
          }
        }
        results['localStorage'] = Object.keys(local).join(', ');
      } catch(e) {}
      
      // Check for __config or similar objects on window
      return results;
    });
    
    console.log('PBI Frame info:', JSON.stringify(fInfo, null, 2));
    
    // Now try to query the API from WITHIN the PBI frame
    const pbiQuery = await f.evaluate(async () => {
      // The actual query data API
      const url = 'https://wabi-australia-southeast-api.analysis.windows.net/public/reports/querydata?synchronous=true';
      
      // Try to find the resource key from fetch calls
      // or use a known one from the page
      
      // Query for all councils
      const query = {
        "version": "1.0.0",
        "queries": [{
          "Query": {
            "Commands": [{
              "SemanticQueryDataShapeCommand": {
                "Query": {
                  "Version": 2,
                  "From": [{"Name": "d", "Entity": "Dim_Councils", "Type": 0}],
                  "Select": [{
                    "Column": {
                      "Expression": {"SourceRef": {"Source": "d"}},
                      "Property": "Council"
                    },
                    "Name": "Council"
                  }]
                }
              }
            }]
          }
        }]
      };
      
      try {
        const resp = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'Accept': 'application/json',
            'x-powerbi-resourcekey': '02dcdd7c-d1b1-4837-a623-d73abb46e338',
            'activityid': 'puppeteer-test-' + Date.now(),
            'requestid': 'puppeteer-req-' + Math.random().toString(36).substring(2)
          },
          body: JSON.stringify(query)
        });
        const data = await resp.text();
        return {status: resp.status, data: data.substring(0, 10000)};
      } catch(e) {
        return {error: e.message};
      }
    });
    
    console.log('PBI query result:', JSON.stringify(pbiQuery, null, 2));
  }
}

await browser.close();
