import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

page.on('response', async (r) => {
  const url = r.url();
  if (url.includes('google') || url.includes('analytics') || url.includes('clarity') || url.includes('.js') || url.includes('.css') || url.includes('.png') || url.includes('.svg')) return;
  if (!url.includes('arcgis') && !url.includes('elastic') && !url.includes('tide') && !url.includes('api')) return;
  try {
    const ct = (r.headers()['content-type']||'');
    if (!ct.includes('json') && !ct.includes('text')) return;
    const body = await r.text();
    console.log('\nRESP(' + r.status() + '): ' + url);
    if (body.length < 5000) console.log(body.substring(0,800));
    else {
      if (url.includes('elasticsearch')) {
        const keys = ['population','rate','revenue','debt','satisfact','indicator','surplus','infrastructure','budget','score','fee','income','expense','operating','capital','renewal','snapshot','website','email','phone','address','source','data'];
        for (const k of keys) { if (body.toLowerCase().includes(k)) console.log('  KEY FOUND: ' + k); }
        console.log('  length=' + body.length + ' first 500=' + body.substring(body.indexOf('"hits"'), Math.min(body.length, body.indexOf('"hits"')+500)));
      } else {
        console.log('  length=' + body.length + ' body=' + body.substring(0,300));
      }
    }
  } catch(e) {}
});

console.log('Loading KYC...');
await page.goto('https://www.knowyourcouncil.vic.gov.au/', {waitUntil:'networkidle2',timeout:60000});
await new Promise(r => setTimeout(r, 3000));

// Navigate to comparison dashboard  
console.log('\nNavigating to comparison dashboard...');
await page.goto('https://www.knowyourcouncil.vic.gov.au/know-your-council-comparison-dashboard', {waitUntil:'networkidle2',timeout:60000});
await new Promise(r => setTimeout(r, 5000));

await browser.close();
console.log('\n=== Done ===');
