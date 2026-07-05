import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

await page.goto('https://www.vic.gov.au/know-your-council-comparison-dashboard', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 3000));

// Find ALL visible text to locate the data download section
console.log('=== All visible buttons and links ===');
const elements = await page.evaluate(() => {
  // Find all buttons, anchors, and interactive elements
  const all = document.querySelectorAll('button, a, [role="button"], details, summary, select, option, [class*="accordion"], [class*="dropdown"]');
  const results = [];
  for (const el of all) {
    const text = (el.textContent || '').trim();
    const href = el.href || '';
    const cl = el.className || '';
    const role = el.getAttribute('role') || '';
    const tag = el.tagName;
    const id = el.id || '';
    const type = el.type || '';
    if (text && text.length < 200) {
      results.push({tag, text: text.substring(0,100), href: href.substring(0,150), id, type, class: cl.substring(0,100), role});
    }
  }
  return results;
});

// Look for data/download indicators
for (const el of elements) {
  const txt = el.text.toLowerCase();
  if (txt.includes('download') || txt.includes('data') || txt.includes('excel') || txt.includes('export') || txt.includes('report') || txt.includes('xls') || txt.includes('csv')) {
    console.log('FOUND:');
    console.log(JSON.stringify(el, null, 2));
  }
}

// Show ALL interactive elements too
console.log('\n=== All interactive elements (first 60) ===');
for (const el of elements.slice(0, 60)) {
  console.log(`[${el.tag}] "${el.text.substring(0,60)}" id="${el.id}" href="${el.href.substring(0,80)}"`);
}

// Check for any shadow DOM or iframe
const shadowElements = await page.evaluate(() => {
  const results = {};
  const iframes = document.querySelectorAll('iframe');
  results['iframes'] = Array.from(iframes).map(f => ({src: f.src, id: f.id}));
  
  // Check for accordion components
  const accordions = document.querySelectorAll('[class*="accordion"], [class*="Accordion"]');
  results['accordionCount'] = accordions.length;
  
  return results;
});
console.log('\niframe/accordion info:', JSON.stringify(shadowElements));

await browser.close();
