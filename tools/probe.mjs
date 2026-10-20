// 來源實測：從 GitHub 的伺服器試抓台灣通路，輸出 JSON（只在 probe 分支用）。
const UA='BeforeCheckoutBot/0.1 (personal price tracker; +https://github.com/PZWei0105/before-checkout)';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out={at:new Date().toISOString(),ua:UA,results:[]};
async function hit(name,url,{decode='utf-8',parse}={}){
  const t0=Date.now();const r={name,url};
  try{
    const res=await fetch(url,{headers:{'User-Agent':UA,'Accept':'*/*','Accept-Language':'zh-TW,zh;q=0.9'},redirect:'follow',signal:AbortSignal.timeout(20000)});
    const buf=new Uint8Array(await res.arrayBuffer());
    const text=new TextDecoder(decode).decode(buf);
    Object.assign(r,{status:res.status,finalUrl:res.url,ms:Date.now()-t0,ctype:res.headers.get('content-type'),len:buf.length,sample:text.slice(0,400)});
    if(parse)try{r.parsed=parse(text)}catch(e){r.parseError=String(e).slice(0,200)}
    return {r,text};
  }catch(e){Object.assign(r,{error:String(e).slice(0,200),ms:Date.now()-t0});return {r,text:''}}
  finally{out.results.push(r);await sleep(1200)}
}
const jsonish=t=>{const m=t.match(/^[^({\[]*\(([\s\S]*)\)\s*;?\s*$/);return JSON.parse(m?m[1]:t)};
const prodsOf=j=>j.Prods||j.prods||[];
const pickProds=t=>{const j=jsonish(t);const ps=prodsOf(j);return {keys:Object.keys(j).slice(0,12),total:j.TotalRows??j.totalRows,n:ps.length,firstKeys:ps[0]?Object.keys(ps[0]).slice(0,20):[],top:ps.slice(0,6).map(p=>({id:p.Id,name:(p.Name||p.name||'').slice(0,70),price:p.Price??p.price,orig:p.OriginPrice??p.originPrice}))}};

const q=encodeURIComponent('RTX 5090');
let pid=null;
for(const v of ['v4.3','v3.3']){
  for(const sort of ['prc/ac','sale/dc']){
    const {r}=await hit(`pchome-search-${v}-${sort}`,`https://ecshweb.pchome.com.tw/search/${v}/all/results?q=${q}&page=1&sort=${encodeURIComponent(sort)}`,{parse:pickProds});
    if(!pid&&r.parsed&&r.parsed.top&&r.parsed.top[0])pid=r.parsed.top[0].id;
  }
}
await hit('pchome-search-v4.3-iphone',`https://ecshweb.pchome.com.tw/search/v4.3/all/results?q=${encodeURIComponent('iPhone 18 Pro Max 256GB')}&page=1&sort=${encodeURIComponent('prc/ac')}`,{parse:pickProds});
await hit('pchome-search-v4.3-elgato',`https://ecshweb.pchome.com.tw/search/v4.3/all/results?q=${encodeURIComponent('Elgato 4K X')}&page=1&sort=${encodeURIComponent('prc/ac')}`,{parse:pickProds});
if(pid){
  const f='Seq,Id,Price,Qty,ButtonType,SaleStatus';
  await hit('pchome-button-cdn',`https://ecapi-cdn.pchome.com.tw/ecshop/prodapi/v2/prod/button&id=${pid}&fields=${f}`,{parse:t=>jsonish(t)});
  await hit('pchome-button-cdn-jsonp',`https://ecapi-cdn.pchome.com.tw/ecshop/prodapi/v2/prod/button&id=${pid}&fields=${f}&_callback=jsonp_button`,{parse:t=>jsonish(t)});
  await hit('pchome-button-ecapi',`https://ecapi.pchome.com.tw/ecshop/prodapi/v2/prod/button&id=${pid}&fields=${f}`,{parse:t=>jsonish(t)});
  await hit('pchome-prod-cdn',`https://ecapi-cdn.pchome.com.tw/ecshop/prodapi/v2/prod/${pid}&fields=Seq,Id,Name,Nick,Price,Qty`,{parse:t=>jsonish(t)});
}
await hit('coolpc-evaluate','https://www.coolpc.com.tw/evaluate.php',{decode:'big5',parse:t=>{
  const lines=t.split(/<\/?option[^>]*>/i).map(s=>s.trim()).filter(s=>/\$\s?\d/.test(s));
  const pick=k=>lines.filter(s=>s.replace(/\s/g,'').toUpperCase().includes(k)).slice(0,6);
  return {priced:lines.length,rtx5090:pick('RTX5090'),rtx5080:pick('RTX5080'),rx9070xt:pick('9070XT'),elgato:pick('ELGATO').slice(0,4)}}});
await hit('yahoo-search',`https://tw.buy.yahoo.com/search/product?p=${encodeURIComponent('RTX 5090')}`,{parse:t=>({nextData:t.includes('__NEXT_DATA__'),isoState:t.includes('ISOREDUX'),dollars:(t.match(/\$\s?[\d,]{4,}/g)||[]).slice(0,8)})});
await hit('momo-search',`https://www.momoshop.com.tw/search/searchShop.jsp?keyword=${encodeURIComponent('RTX 5090')}`,{parse:t=>({dollars:(t.match(/[\d,]{4,}\s*元|\$\s?[\d,]{4,}/g)||[]).slice(0,8)})});
await hit('biggo-search',`https://biggo.com.tw/s/${encodeURIComponent('RTX 5090')}/`,{parse:t=>({dollars:(t.match(/\$\s?[\d,]{4,}/g)||[]).slice(0,8)})});
for(const h of ['ecshweb.pchome.com.tw','ecapi-cdn.pchome.com.tw','ecapi.pchome.com.tw','24h.pchome.com.tw','www.coolpc.com.tw','tw.buy.yahoo.com','www.momoshop.com.tw','biggo.com.tw'])
  await hit('robots-'+h,`https://${h}/robots.txt`,{parse:t=>t.slice(0,1500)});
console.log(JSON.stringify(out,null,1));
