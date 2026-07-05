import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

// Wait for all data to be loaded
console.log('Loading and waiting for full hydration...');
await page.goto('https://www.knowyourcouncil.vic.gov.au/', {
  waitUntil: 'networkidle0',
  timeout: 60000
});
await new Promise(r => setTimeout(r, 5000));

// Now dig into the Nuxt/ Vue app to find KYC indicator data
let results = await page.evaluate(() => {
  const nuxtApp = window.useNuxtApp();
  const output = {};
  
  // Get all reactive state from vue app
  if (nuxtApp && nuxtApp._context && nuxtApp._context.app) {
    const app = nuxtApp._context.app;
    const config = app.config;
    output['appConfig'] = config.globalProperties ? Object.keys(config.globalProperties).slice(0, 20) : 'none';
    
    // Check available components
    if (app._component && app._component.components) {
      output['components'] = Object.keys(app._component.components).slice(0, 20);
    }
    
    // Look for provide/inject data
    if (nuxtApp._context.provides) {
      const provides = nuxtApp._context.provides;
      output['providesKeys'] = Array.isArray(provides) ? provides.slice(0, 10).map(k => typeof k === 'string' ? k.substring(0,50) : typeof k) : 'no';
    }
  }
  
  // Check for Pinia stores
  try {
    // Nuxt 3 uses Pinia. Look for stores on the app
    const pinia = nuxtApp.$pinia;
    if (pinia) {
      const state = pinia.state ? pinia.state.value : {};
      output['piniaStateKeys'] = Object.keys(state);
      for (const key of Object.keys(state)) {
        const val = JSON.stringify(state[key]);
        output['pinia_' + key] = val.substring(0, 500);
      }
    }
  } catch(e) {
    output['piniaError'] = e.message;
  }
  
  // Check for the Nuxt payload
  try {
    const payload = nuxtApp.payload;
    if (payload) {
      output['payloadKeys'] = Object.keys(payload).join(', ');
      if (payload.data) output['payloadDataKeys'] = JSON.stringify(Object.keys(payload.data)).substring(0, 200);
    }
  } catch(e) {}
  
  // Check $fetch or $tide client module
  try {
    const tide = nuxtApp.$tide;
    if (tide) output['tideKeys'] = Object.keys(tide).join(', ').substring(0, 200);
  } catch(e) {}
  
  // Check all global properties
  const gp = nuxtApp._context.app.config.globalProperties;
  if (gp) {
    output['globalPropKeys'] = Object.keys(gp).join(', ');
  }
  
  return output;
});

console.log('Vue/Nuxt state:');
console.log(JSON.stringify(results, null, 2));

// Also check what happens when we click the list view
console.log('\n\nClicking List tab and checking for new data...');
try {
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      if (b.textContent.toLowerCase().includes('list')) {
        b.click();
        return 'clicked list';
      }
    }
    return 'no list button';
  });
} catch(e) {}
await new Promise(r => setTimeout(r, 3000));

// Now check app state again - look for the actual council list data rendered
let listData = await page.evaluate(() => {
  // Check rendered elements
  const results = {};
  
  // Find all council names in the rendered DOM
  const allElements = document.body.innerText;
  const lines = allElements.split('\n').filter(l => l.trim().length > 0);
  results['visibleTextLines'] = lines.length;
  
  // Look for indicator-like text patterns
  const patterns = ['Rates', 'Revenue', 'Debt', 'Satisfaction', 'Population', 'Budget', 'surplus', 'renewal', 'income'];
  for (const pat of patterns) {
    if (allElements.toLowerCase().includes(pat.toLowerCase())) {
      results['found_' + pat] = allElements.substring(
        Math.max(0, allElements.toLowerCase().indexOf(pat.toLowerCase()) - 50),
        allElements.toLowerCase().indexOf(pat.toLowerCase()) + 50
      );
    }
  }
  
  // Check what's visible on the page
  results['domElements'] = document.querySelectorAll('*').length;
  results['buttons'] = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t);
  
  return results;
});

console.log('\nList view data:');
console.log(JSON.stringify(listData, null, 2));

// Hmm - maybe the data is in the page's rendered HTML, let me search more carefully
const pageContent = await page.content();
for (const term of ['population', 'rate_income', 'debt_to', 'satisfaction', 'operating', 'surplus', 'renewal', 'infrastructure']) {
  const idx = pageContent.toLowerCase().indexOf(term);
  if (idx >= 0) {
    console.log('\nFOUND term [' + term + ']:');
    console.log(pageContent.substring(Math.max(0, idx - 100), idx + 200));
  }
}

await browser.close();
