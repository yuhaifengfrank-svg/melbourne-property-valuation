import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

page.on('request', (req) => {
  const url = req.url();
  if (url.includes('tide') || url.includes('elastic') || url.includes('_search') || url.includes('query')) {
    const pd = req.postData();
    if (pd) {
      console.log('REQ: ' + req.method() + ' ' + url);
      try {
        const parsed = JSON.parse(pd);
        console.log(JSON.stringify(parsed, null, 2));
      } catch(e) {
        console.log('BODY: ' + pd.substring(0, 500));
      }
      console.log('');
    }
  }
});

page.on('response', async (r) => {
  const url = r.url();
  if (url.includes('tide') || url.includes('elastic') || url.includes('_search')) {
    try {
      const ct = (r.headers()['content-type']||'');
      if (ct.includes('json')) {
        const body = await r.text();
        console.log('=== RESPONSE(' + r.request().method() + ' ' + url + ') ===');
        console.log(body.substring(0, 5000));
        if (body.length > 5000) console.log('... [total ' + body.length + ']');
      }
    } catch(e) {}
  }
});

await page.goto('https://www.knowyourcouncil.vic.gov.au/', {waitUntil:'networkidle2',timeout:60000});
await new Promise(r => setTimeout(r, 2000));

// Click list tab and see what request is made
await page.evaluate(() => {
  const buttons = document.querySelectorAll('button');
  for (const b of buttons) {
    if (b.textContent.toLowerCase().includes('list')) { b.click(); return; }
  }
});
await new Promise(r => setTimeout(r, 5000));

await browser.close();
