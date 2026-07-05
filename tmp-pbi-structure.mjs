import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

await page.goto('https://app.powerbi.com/view?r=eyJrIjoiMDJkY2RkN2MtZDFiMS00ODM3LWE2MjMtZDczYWJiNDZlMzM4IiwidCI6IjcyMmVhMGJlLTNlMWMtNGIxMS1hZDZmLTk0MDFkNjg1NmUyNCJ9', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 10000));

// Helper: wait and log
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// First, let me understand the page structure
console.log('=== Page structure ===');
const structure = await page.evaluate(() => {
  const results = {};
  
  // Find all interactive elements
  const allButtons = document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], [role="listbox"], select');
  results['interactiveElements'] = Array.from(allButtons).slice(0, 30).map(el => ({
    tag: el.tagName,
    type: el.type || '',
    role: el.getAttribute('role') || '',
    class: typeof el.className === 'string' ? el.className.substring(0, 60) : String(el.className || '').substring(0, 60),
    ariaLabel: el.getAttribute('aria-label') || '',
    text: (el.textContent || '').trim().substring(0, 80),
    id: el.id || ''
  }));
  
  // Find ALL text content
  const allText = document.body.innerText;
  results['fullText'] = allText;
  
  // Find dropdown elements
  const dropdowns = document.querySelectorAll('select, [role="listbox"], [aria-haspopup="listbox"]');
  results['dropdowns'] = Array.from(dropdowns).map(d => ({
    tag: d.tagName,
    role: d.getAttribute('role') || '',
    text: (d.textContent || '').trim().substring(0, 100),
    options: d.tagName === 'SELECT' ? Array.from(d.options || []).map(o => o.text).slice(0, 10) : []
  }));
  
  // Find all tabs
  const tabs = document.querySelectorAll('[role="tab"], [role="tablist"]');
  results['tabs'] = Array.from(tabs).slice(0, 20).map(t => ({
    text: (t.textContent || '').trim().substring(0, 60),
    selected: t.getAttribute('aria-selected') || '',
    role: t.getAttribute('role') || ''
  }));
  
  // Check for slicers (Power BI filter elements)
  const slicers = document.querySelectorAll('[class*="slicer"], [class*="Slicer"], [role="slider"]');
  results['slicersCount'] = slicers.length;
  
  return results;
});

console.log('Full text from page:');
console.log(structure.fullText);
console.log('\nInteractive elements:');
console.log(JSON.stringify(structure.interactiveElements, null, 2));
console.log('\nTabs found:');
console.log(JSON.stringify(structure.tabs, null, 2));

await browser.close();
