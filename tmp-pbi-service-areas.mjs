import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

// Save ALL raw querydata responses as they come in  
page.on('response', async (r) => {
  const url = r.url();
  if (url.includes('querydata')) {
    try {
      const buf = await r.buffer();
      if (buf.length > 1000) {
        const ts = Date.now();
        fs.writeFileSync(`/tmp/pbi-qd-${ts}-${buf.length}.json`, buf);
      }
    } catch(e) {}
  }
  if (url.includes('modelsAndExploration')) {
    try {
      const buf = await r.buffer();
      fs.writeFileSync(`/tmp/pbi-models-full.json`, buf);
      console.log(`Saved models: ${buf.length} bytes`);
    } catch(e) {}
  }
});

await page.goto('https://app.powerbi.com/view?r=eyJrIjoiMDJkY2RkN2MtZDFiMS00ODM3LWE2MjMtZDczYWJiNDZlMzM4IiwidCI6IjcyMmVhMGJlLTNlMWMtNGIxMS1hZDZmLTk0MDFkNjg1NmUyNCJ9', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 8000));

console.log('Initial load complete. Now simulating service area clicks...');

// Find the service area buttons and click "Home" tab or navigate
const pageStructure = await page.evaluate(() => {
  // Look for small-multiples-grid elements (these are the service area tabs)
  const gridCells = document.querySelectorAll('.small-multiples-grid-cell-content');
  const results = [];
  
  for (const cell of gridCells) {
    const text = cell.textContent.trim();
    const ariaLabel = cell.getAttribute('aria-label') || '';
    results.push({text: text.substring(0, 80), ariaLabel: ariaLabel.substring(0, 80), classes: cell.className});
  }
  
  // Also look for any kind of tab strip
  const tabStrips = document.querySelectorAll('[role="tablist"], [role="tab"], [class*="tab"], [class*="pivot"]');
  for (const el of tabStrips) {
    results.push({
      text: (el.textContent || '').trim().substring(0, 60),
      role: el.getAttribute('role') || '',
      class: typeof el.className === 'string' ? el.className.substring(0, 60) : ''
    });
  }
  
  return results;
});
console.log('Grid cells / tabs:', JSON.stringify(pageStructure, null, 2));

// Now let me click on Financial Performance - I need to find it and click it
// The service area is likely a list/group of buttons. Let me find them.
await page.evaluate(() => {
  // Try to find the service areas in the small-multiples grid
  const serviceAreas = document.querySelectorAll('[class*="small-multiples"]');
  console.log(`Found ${serviceAreas.length} small-multiples elements`);
  
  // Also look for elements with specific text
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    if (el.textContent && el.textContent.includes('Financial Performance') && el.children.length === 0 && el.textContent.length < 30) {
      console.log('Found Financial Performance text:', el.tagName, el.className);
    }
  }
});

// Click "Financial Performance" to see the financial indicators
// Based on the structure, I need to find the right element to click
await page.evaluate(() => {
  // Look for the page navigation bookmarks - these might be the service area selector
  const bookmarkLinks = document.querySelectorAll('[role="link"]');
  for (const link of bookmarkLinks) {
    const label = link.getAttribute('aria-label') || '';
    if (label.includes('Bookmark') && label.includes('Page navigation')) {
      console.log('Bookmark link found:', label);
    }
  }
  
  // Check the "Your Council Dashboard" element which might have sub-pages
  const dashboardContainer = document.querySelector('[class*="dashboard"], [class*="Dashboard"]');
  if (dashboardContainer) {
    console.log('Dashboard container found');
  }
});

// Wait and check if any visual changed after clicking
await new Promise(r => setTimeout(r, 3000));

// Read the screen reader text to check current state
const appState = await page.evaluate(() => {
  // Get the full accessibility description
  const landmarks = document.querySelectorAll('[role="region"],[role="group"]');
  const results = {};
  for (const el of landmarks) {
    const label = el.getAttribute('aria-label') || el.getAttribute('aria-roledescription') || '';
    if (label) {
      const text = el.textContent.trim().substring(0, 100);
      results[label] = text;
    }
  }
  return results;
});
console.log('\nPage regions:', JSON.stringify(appState, null, 2));

await browser.close();
