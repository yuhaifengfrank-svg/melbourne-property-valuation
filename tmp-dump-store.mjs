import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080});

console.log('Loading KYC...');
await page.goto('https://www.knowyourcouncil.vic.gov.au/', {
  waitUntil: 'networkidle2',
  timeout: 60000
});
await new Promise(r => setTimeout(r, 3000));

// Evaluate the page's Vue.js store/data
let data = await page.evaluate(() => {
  // Nuxt 3 stores state in window.__NUXT__
  const nuxt = window.__NUXT__;
  if (nuxt) return JSON.stringify(nuxt).substring(0, 5000);
  
  // Check for Vue app
  const app = document.getElementById('__nuxt') || document.querySelector('[data-vue-app]');
  if (!app) return 'no nuxt app found';
  
  return 'app exists, checking __NUXT__...';
});

console.log('NUXT data:');
console.log(data);

// Try to access the Pinia store directly
let storeData = await page.evaluate(() => {
  try {
    // Check both Nuxt 2 and Nuxt 3 patterns
    const win = window;
    
    // Nuxt 3: useNuxtApp
    const results = {};
    
    // Check window properties for Vue-related items
    for (const key of Object.getOwnPropertyNames(win)) {
      if (key.toLowerCase().includes('vue') || key.toLowerCase().includes('nuxt') || key.toLowerCase().includes('store') || key.toLowerCase().includes('pinia')) {
        results[key] = typeof win[key];
      }
    }
    
    // Check the __NUXT__ state for search-related data
    if (win.__NUXT__) {
      const state = win.__NUXT__;
      results['nuxtDataKeys'] = Object.keys(state).join(', ');
      
      // Check for search/lga data in the state
      if (state.data) results['dataKeys'] = Object.keys(state.data).join(', ');
      if (state.state) results['stateKeys'] = Object.keys(state.state).join(', ');
      
      // Look for LGA data anywhere
      const str = JSON.stringify(state);
      for (const term of ['lga', 'council', 'indicator', 'rate_income', 'debt', 'satisfaction', 'population', 'revenue']) {
        const idx = str.toLowerCase().indexOf(term);
        if (idx >= 0) {
          results[term + 'Index'] = idx;
          results[term + 'Context'] = str.substring(Math.max(0, idx-30), idx + 80);
        }
      }
    }
    
    return results;
  } catch(e) {
    return { error: e.message };
  }
});

console.log('\nStore data:');
console.log(JSON.stringify(storeData, null, 2));

await browser.close();
