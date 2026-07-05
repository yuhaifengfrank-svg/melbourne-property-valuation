import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

await page.goto('https://app.powerbi.com/view?r=eyJrIjoiMDJkY2RkN2MtZDFiMS00ODM3LWE2MjMtZDczYWJiNDZlMzM4IiwidCI6IjcyMmVhMGJlLTNlMWMtNGIxMS1hZDZmLTk0MDFkNjg1NmUyNCJ9', {
  waitUntil: 'networkidle2', timeout: 60000
});
await new Promise(r => setTimeout(r, 8000));

// Check if window.exploration has the actual data model
console.log('=== Checking exploration data ===');
const exploreData = await page.evaluate(() => {
  const results = {};
  
  // Check the exploration object (should have the full model tree)
  if (window.exploration) {
    const exp = window.exploration;
    results['explorationType'] = typeof exp;
    if (typeof exp === 'object') {
      const keys = Object.keys(exp);
      results['explorationKeys'] = keys.slice(0, 20);
      
      // Check for sections/pods
      if (exp.sections) {
        results['sectionCount'] = exp.sections.length;
      }
      if (exp.pods) {
        results['podCount'] = exp.pods.length;
      }
      if (exp.report) {
        results['reportKeys'] = Object.keys(exp.report).slice(0, 10);
      }
    }
  }
  
  // Check for the actual visual data - the DSR blocks
  // Power BI stores the rendered visual data in window.__v or similar
  for (const key of ['__visuals', '__visualData', '__embedData', '__v', '__data', 'visualData']) {
    if (window[key]) {
      results['found_' + key] = typeof window[key];
    }
  }
  
  // Check for any data cached by Power BI
  // Look in the embed controller
  try {
    const embedCtrl = document.querySelector('powerbivisual, pbi-visual');
    if (embedCtrl) {
      results['embedCtrlFound'] = true;
    }
  } catch(e) {}
  
  // Also check sessionStorage and localStorage for data
  try {
    const allKeys = [];
    const sessionData = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      allKeys.push(k);
    }
    results['sessionStorageKeys'] = allKeys.slice(0, 30);
    
    const localKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      localKeys.push(k);
    }
    results['localStorageKeys'] = localKeys.slice(0, 30);
  } catch(e) {
    results['storageError'] = e.message;
  }
  
  return results;
});
console.log(JSON.stringify(exploreData, null, 2));

// Now let's check the Power BI embed controller
const renderData = await page.evaluate(() => {
  const results = {};
  
  // The Power BI visual data is in the document. Let me find all visual containers
  // and extract their data attributes
  const visualContainers = document.querySelectorAll('[class*="visualContainer"], [class*="visual-container"]');
  results['visualContainerCount'] = visualContainers.length;
  
  // For each visual, try to find its data
  const samples = [];
  let textSample = '';
  
  for (const vc of Array.from(visualContainers).slice(0, 5)) {
    const text = vc.textContent.trim();
    if (text) {
      textSample += text.substring(0, 200) + '\n---\n';
    }
    const dataAttrs = {};
    for (const attr of vc.getAttributeNames()) {
      dataAttrs[attr] = vc.getAttribute(attr);
    }
    samples.push({
      id: vc.id,
      class: vc.className.substring(0, 100),
      dataAttrs,
      text: vc.textContent.trim().substring(0, 150)
    });
  }
  results['visualSamples'] = samples;
  results['allText'] = document.body.innerText.substring(0, 3000);
  
  return results;
});
console.log('\n=== Visual data ===');
console.log(JSON.stringify(renderData, null, 2).substring(0, 5000));

await browser.close();
