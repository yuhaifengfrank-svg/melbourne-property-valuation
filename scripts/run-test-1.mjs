// 只测3个，看看错误是什么
const API = 'https://aushomevalue.com.au/api/valuation';
const tests = [
  {address: '16 Comas Road, Beaumaris, VIC 3193', propertyType: 'House'},
  {address: '2/14 Gadd Street, Oakleigh, VIC 3166', propertyType: 'Townhouse'},
];
for (const {address, propertyType} of tests) {
  try {
    console.log(`测: ${address} (${propertyType})`);
    const r = await fetch(API, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({address, propertyType})});
    const txt = await r.text();
    console.log(`  HTTP ${r.status}, ${txt.slice(0,200)}`);
  } catch(e) {
    console.log(`  错误: ${e.message.slice(0,100)}`);
  }
}
