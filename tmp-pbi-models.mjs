import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

// Capture modelsAndExploration GET response
page.on('response', async (r) => {
  const url = r.url();
  if (url.includes('modelsAndExploration')) {
    try {
      const body = await r.text();
      console.log('Models response length:', body.length);
      fs.writeFileSync('/tmp/pbi-models.json', body);
      console.log('Saved to /tmp/pbi-models.json');
    } catch(e) {
      console.log('Error:', e.message);
    }
  }
});

await page.goto('https://app.powerbi.com/view?r=eyJrIjoiMDJkY2RkN2MtZDFiMS00ODM3LWE2MjMtZDczYWJiNDZlMzM4IiwidCI6IjcyMmVhMGJlLTNlMWMtNGIxMS1hZDZmLTk0MDFkNjg1NmUyNCJ9', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 8000));

await browser.close();
