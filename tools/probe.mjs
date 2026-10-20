// 開發用：測 PChome 搜尋的排序與價格區間參數（只在 probe 分支用）。
import fs from 'node:fs';
const UA='BeforeCheckoutBot/0.1 (personal price tracker; +https://github.com/PZWei0105/before-checkout)';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync('fixtures',{recursive:true});
const log=[];
async function save(name,url){
  try{const res=await fetch(url,{headers:{'User-Agent':UA,'Accept-Language':'zh-TW,zh;q=0.9'},signal:AbortSignal.timeout(25000)});
    const t=await res.text();fs.writeFileSync('fixtures/'+name,t);let s={};try{const j=JSON.parse(t);const ps=j.Prods||[];s={total:j.TotalRows,n:ps.length,min:Math.min(...ps.map(p=>p.Price)),max:Math.max(...ps.map(p=>p.Price))}}catch{}
    log.push({name,url,status:res.status,...s})}
  catch(e){log.push({name,url,error:String(e).slice(0,200)})}
  await sleep(1200);
}
const B='https://ecshweb.pchome.com.tw/search/v4.3/all/results';
const enc=encodeURIComponent;
for(const p of [1,2,3,4])await save(`v-5080-prcdc-p${p}.json`,`${B}?q=${enc('RTX 5080 16G 顯示卡')}&page=${p}&sort=${enc('prc/dc')}`);
await save('v-5080-price.json',`${B}?q=${enc('RTX 5080 16G 顯示卡')}&page=1&sort=${enc('sale/dc')}&price=40000-100000`);
await save('v-5080-price2.json',`${B}?q=${enc('RTX 5080 16G 顯示卡')}&page=1&sort=${enc('prc/ac')}&price=40000-100000`);
for(const p of [1,2,3])await save(`v-iphone-prcdc-p${p}.json`,`${B}?q=${enc('Apple iPhone 18 Pro Max 256G')}&page=${p}&sort=${enc('prc/dc')}`);
await save('v-iphone-price.json',`${B}?q=${enc('iPhone 18 Pro Max')}&page=1&sort=${enc('sale/dc')}&price=40000-80000`);
await save('v-5090-price.json',`${B}?q=${enc('RTX 5090')}&page=1&sort=${enc('prc/ac')}&price=80000-300000`);
await save('v-4kx.json',`${B}?q=${enc('Game Capture 4K X')}&page=1&sort=${enc('sale/dc')}`);
await save('v-facecam.json',`${B}?q=${enc('Facecam 4K')}&page=1&sort=${enc('sale/dc')}`);
fs.writeFileSync('fixtures/_log.json',JSON.stringify({at:new Date().toISOString(),log},null,1));
