import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

let queries = [];

page.on('request', (req) => {
  const url = req.url();
  if (url.includes('querydata') || url.includes('modelsAndExploration') || url.includes('conceptualschema') || url.includes('resourcePackage')) {
    const pd = req.postData();
    const h = req.headers();
    queries.push({
      url: url.substring(0, 200),
      method: req.method(),
      headers: {
        'content-type': h['content-type'],
        'origin': h['origin'],
        'referer': h['referer'],
        'x-powerbi-resourcekey': h['x-powerbi-resourcekey'],
        'activityid': h['activityid'],
        'requestid': h['requestid'],
      },
      body: pd ? pd.substring(0, 15000) : null
    });
  }
});

console.log('Loading Power BI report...');
await page.goto('https://app.powerbi.com/view?r=eyJrIjoiMDJkY2RkN2MtZDFiMS00ODM3LWE2MjMtZDczYWJiNDZlMzM4IiwidCI6IjcyMmVhMGJlLTNlMWMtNGIxMS1hZDZmLTk0MDFkNjg1NmUyNCJ9', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 8000));

// Save everything
fs.writeFileSync('/tmp/pbi-queries.json', JSON.stringify(queries, null, 2));
console.log(`Saved ${queries.length} queries`);

// Print the querydata bodies
for (const q of queries) {
  if (q.url.includes('querydata') && q.body) {
    console.log('\n=== QUERY ===');
    console.log('Headers:', JSON.stringify(q.headers, null, 2));
    try {
      const parsed = JSON.parse(q.body);
      console.log(JSON.stringify(parsed, null, 2).substring(0, 5000));
    } catch(e) {
      console.log('Raw:', q.body.substring(0, 500));
    }
  }
}

// Also save the modelsAndExploration response which contains the data model schema
for (const q of queries) {
  if (q.url.includes('modelsAndExploration')) {
    console.log('\n=== MODELS URL ===');
    console.log(q.url);
  }
}

await browser.close();
