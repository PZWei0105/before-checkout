// 開發用：把各商品的 PChome 搜尋結果與原價屋報價頁原樣存下來，供本機寫比對規則（只在 probe 分支用）。
import fs from 'node:fs';
const UA='BeforeCheckoutBot/0.1 (personal price tracker; +https://github.com/PZWei0105/before-checkout)';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync('fixtures',{recursive:true});
const log=[];
async function save(name,url){
  try{const res=await fetch(url,{headers:{'User-Agent':UA,'Accept-Language':'zh-TW,zh;q=0.9'},signal:AbortSignal.timeout(25000)});
    const buf=Buffer.from(await res.arrayBuffer());fs.writeFileSync('fixtures/'+name,buf);log.push({name,url,status:res.status,len:buf.length,ctype:res.headers.get('content-type')})}
  catch(e){log.push({name,url,error:String(e).slice(0,200)})}
  await sleep(1200);
}
const Q={'rtx-5090':'RTX 5090 顯示卡','rtx-5080':'RTX 5080 顯示卡','rx-9070-xt':'RX 9070 XT 顯示卡','iphone-18-pro-max':'iPhone 18 Pro Max','elgato-4k-x':'Elgato 4K X','elgato-facecam-4k':'Elgato Facecam 4K','elgato-stream-deck-mk2':'Elgato Stream Deck MK.2'};
for(const [id,q] of Object.entries(Q))for(const page of [1,2,3])
  await save(`pchome-${id}-p${page}.json`,`https://ecshweb.pchome.com.tw/search/v4.3/all/results?q=${encodeURIComponent(q)}&page=${page}&sort=${encodeURIComponent('sale/dc')}`);
await save('coolpc-evaluate.html','https://www.coolpc.com.tw/evaluate.php');
fs.writeFileSync('fixtures/_log.json',JSON.stringify({at:new Date().toISOString(),log},null,1));
