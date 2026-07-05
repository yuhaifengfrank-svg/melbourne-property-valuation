import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  dumpio: true
});
const page = await browser.newPage();
await page.setViewport({width: 1920, height: 1080});

// Log ALL fetch/XHR requests including their full response bodies
page.on('response', async (r) => {
  const url = r.url();
  try {
    const contentType = (r.headers()['content-type'] || '').toLowerCase();
    // Log ALL non-static content
    if (!contentType.includes('image') && !contentType.includes('font') && !url.includes('.js') && !url.includes('.css')) {
      const body = await r.text();
      if (url.includes('google') || url.includes('analytics') || url.includes('clarity')) return;
      console.log('\n=== ' + r.status() + ' ' + r.request().method() + ' ' + url + ' ===');
      console.log('CT: ' + contentType);
      console.log('Body length: ' + body.length);
      if (body.length < 10000) {
        console.log(body.substring(0, 3000));
      } else {
        console.log(body.substring(0, 500) + '...');
        // Check for keywords
        for (const kw of ['population','rate','revenue','debt','satisfact','indicator','surplus','infrastructure','renewal','budget','rate_income','rate_','community']) {
          if (body.toLowerCase().includes(kw)) {
            const idx = body.toLowerCase().indexOf(kw);
            console.log('  FOUND [' + kw + '] at offset ' + idx + ': ' + body.substring(Math.max(0,idx-50), idx+100));
          }
        }
      }
    }
  } catch(e) {
    console.log('Error reading response: ' + e.message);
  }
});

console.log('1. Loading KYC homepage...');
await page.goto('https://www.knowyourcouncil.vic.gov.au/', {
  waitUntil: 'networkidle2',
  timeout: 60000
});
await new Promise(r => setTimeout(r, 2000));

console.log('\n2. Navigating to comparison dashboard...');
await page.goto('https://www.knowyourcouncil.vic.gov.au/know-your-council-comparison-dashboard', {
  waitUntil: 'networkidle2',
  timeout: 60000
});
await new Promise(r => setTimeout(r, 3000));

console.log('\n3. Trying to click on "List" tab...');
try {
  const listTab = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      if (b.textContent.toLowerCase().includes('list')) {
        b.click();
        return 'clicked: ' + b.textContent;
      }
    }
    return 'no list button found';
  });
  console.log('List tab action: ' + listTab);
} catch(e) {
  console.log('Error: ' + e.message);
}
await new Promise(r => setTimeout(r, 5000));

console.log('\n4. Searching for "Melbourne" to trigger data load...');
try {
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    for (const inp of inputs) {
      if (inp.placeholder && (inp.placeholder.toLowerCase().includes('suburb') || inp.placeholder.toLowerCase().includes('council') || inp.placeholder.toLowerCase().includes('address'))) {
        inp.focus();
        inp.value = '';
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(inp, 'Melbourne');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        console.log('Typed Melbourne');
        return;
      }
    }
    console.log('No matching input found');
  });
} catch(e) {
  console.log('Error searching: ' + e.message);
}
await new Promise(r => setTimeout(r, 5000));

console.log('\n5. Pressing Enter in search...');
try {
  await page.keyboard.press('Enter');
} catch(e) {}
await new Promise(r => setTimeout(r, 3000));

console.log('\n=== Search Results (page title): ' + await page.title() + ' ===');

await browser.close();
