import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

await page.goto('https://app.powerbi.com/view?r=eyJrIjoiMDJkY2RkN2MtZDFiMS00ODM3LWE2MjMtZDczYWJiNDZlMzM4IiwidCI6IjcyMmVhMGJlLTNlMWMtNGIxMS1hZDZmLTk0MDFkNjg1NmUyNCJ9', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 8000));

// PRAGMATIC APPROACH: Read the rendered text data for ALL service areas
// The Power BI report has a "Your Council Dashboard" page with service area tabs
// I need to switch between service areas and read each indicator's data

console.log('=== Reading rendered data for ALL service areas ===');

// First, find the current data for "Alpine Shire - Animals reclaimed from council"  
// Then I'll need to figure out how to click service areas and indicators

// Let me describe what I can see using accessibility
const axTree = await page.evaluate(() => {
  const results = {};
  
  // Get ALL text content
  const text = document.body.innerText;
  results['fullText'] = text;
  
  // Find all clickable elements
  const clickable = document.querySelectorAll('[role="button"], [role="tab"], [role="option"], [aria-label], button, a');
  results['clickableElements'] = Array.from(clickable).slice(0, 40).map(el => ({
    tag: el.tagName,
    role: el.getAttribute('role') || '',
    ariaLabel: el.getAttribute('aria-label') || '',
    text: (el.textContent || '').trim().substring(0, 80),
    tabindex: el.getAttribute('tabindex') || '',
    id: el.id || ''
  }));
  
  return results;
});

console.log(axTree.fullText);
console.log('\n\n=== Clickable elements ===');
for (const el of axTree.clickableElements) {
  if (el.ariaLabel || el.text) {
    console.log(`[${el.tag}] role=${el.role} label="${el.ariaLabel.substring(0,60)}" text="${el.text.substring(0,60)}"`);
  }
}

await browser.close();
