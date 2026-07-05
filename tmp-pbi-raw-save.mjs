import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

let respIndex = 0;

page.on('response', async (r) => {
  const url = r.url();
  if (url.includes('querydata') || url.includes('modelsAndExploration')) {
    try {
      const body = await r.buffer();
      const fname = `/tmp/pbi-raw-${respIndex++}-${r.status()}.json`;
      fs.writeFileSync(fname, body);
      console.log(`Saved ${body.length} bytes to ${fname} (${r.status()}: ${url.substring(0, 120)})`);
    } catch(e) {
      console.log('Error reading response:', e.message);
    }
  }
});

await page.goto('https://app.powerbi.com/view?r=eyJrIjoiMDJkY2RkN2MtZDFiMS00ODM3LWE2MjMtZDczYWJiNDZlMzM4IiwidCI6IjcyMmVhMGJlLTNlMWMtNGIxMS1hZDZmLTk0MDFkNjg1NmUyNCJ9', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 8000));

console.log(`\nTotal saved: ${respIndex} responses`);
await browser.close();
