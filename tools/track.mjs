#!/usr/bin/env node
/* 下單前：自動追價（GitHub Actions 定時執行，完全不用 Claude）
 *   node tools/track.mjs                 依時段決定要不要追價：每天 09、21 點；大促前 3 天到隔天每小時
 *   node tools/track.mjs --force         不管時段，立刻追價
 *   node tools/track.mjs --dry           只印報告，不寫檔
 *   node tools/track.mjs --fixtures DIR  用存下的原始資料測試（開發用）
 *
 * 來源只用條款與 robots.txt 允許的：
 *   - PChome 24h 搜尋 API（ecshweb.pchome.com.tw/search/v4.3）
 *   - 原價屋線上報價頁（www.coolpc.com.tw/evaluate.php）
 * 不用：Yahoo購物（條款三-2.8 禁止自動化存取）、momo（條款第捌條第 4 款禁止）、
 *       BigGo（轉載上述網站的價格）、PChome ecapi 主機（robots.txt 全面禁止）。
 *
 * 每件商品的比對規則寫在 data/products/<id>.json 的 "track"（格式見 SECRETARY.md）。
 * 結果寫到 data/prices/<id>.json；打包時（tools/build.mjs）才合併進判定。 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const FORCE=args.includes('--force'),DRY=args.includes('--dry');
const fi=args.indexOf('--fixtures');const FIX=fi>=0?path.resolve(args[fi+1]):null;
const UA='BeforeCheckoutBot/1.0 (personal price tracker; +https://github.com/PZWei0105/before-checkout)';
const HOLD=0.25;          // 跟上次採用的價格差超過 25%：先擋下，等秘書確認
const DAILY_MAX=400;      // 每日價格最多保留約 13 個月
const RUNS_MAX=60;
const PDIR=path.join(ROOT,'data','prices');
const SRC_LABEL={pchome:'PChome 24h',coolpc:'原價屋'};

/* ---------- time (Taiwan) ---------- */
const TWO=8*36e5;
const twDate=d=>new Date(d.getTime()+TWO).toISOString().slice(0,10);
const twIso=d=>new Date(d.getTime()+TWO).toISOString().slice(0,19)+'+08:00';
const twHour=d=>new Date(d.getTime()+TWO).getUTCHours();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- io ---------- */
const readJSON=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return d}};
const writeJSON=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,1)+'\n');

/* ---------- matching ---------- */
const norm=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s\-_/｜|·・()（）【】\[\]{}｛｝,，.。:：'"〈〉《》]/g,'');
const MACRO={
  '@pc':['處理器','WIN11','WIN10','電腦','筆電','筆記型','工作站','桌機','主機','LAPTOP','NOTEBOOK','準系統','ALTOS','INFINITE'],
  '@bundle':['組合','套裝','電供','電源供應','記憶體','SSD','硬碟','機殼','主機板','鈔省價'],
  '@acc':['保護','殼','玻璃貼','保貼','膜','支架','支撐','傳輸線','充電','轉接','收納','鏡頭','水冷頭','背板','延長','KOBO','BLUEPRINT','書'],
  '@used':['展示品','維修品','福利品','福利','二手','整新','拆封','中古','九成新']
};
function expand(list){const out=[];for(const x of list||[])out.push(...(MACRO[x]||[x]));return out.map(norm).filter(Boolean)}
function isPlusBundle(t){return norm(t).replace(/NITRO\+/g,'').replace(/STREAMDECK\+/g,'').includes('+')}
function matcher(rule,band){
  const must=(rule.must||[]).map(norm),any=(rule.any||[]).map(norm),not=expand(rule.not);
  const plus=(rule.not||[]).includes('@bundle');
  return c=>{
    const t=norm(c.title);
    if(!must.every(k=>t.includes(k)))return 'must';
    if(any.length&&!any.some(k=>t.includes(k)))return 'any';
    const bad=not.find(k=>t.includes(k));if(bad)return 'not:'+bad;
    if(plus&&isPlusBundle(c.title))return 'not:+';
    if(band&&(c.price<band[0]||c.price>band[1]))return 'band';
    return '';
  };
}
const condOf=t=>/限搭機/.test(t)?'限搭機':/任搭價/.test(t)?'任搭價':'';
/* 沒選上的商品裡，最像目標的 3 筆（must 對中越多越前面）。寫進價格檔，比對不到時看這裡就知道該怎麼調 must／not。 */
function nearOf(rej,cfg){
  const must=(cfg.must||[]).map(norm);
  const hit=c=>{const t=norm(c.title);return must.filter(k=>t.includes(k)).length};
  return rej.map(x=>({...x,h:hit(x.c)})).sort((a,b)=>b.h-a.h||a.c.price-b.c.price).slice(0,3)
    .map(x=>({p:x.c.price,t:String(x.c.title).slice(0,70),r:x.r}));
}

/* ---------- fetch ---------- */
let pchomeQueries={};
async function get(url,decode='utf-8'){
  if(FIX){
    if(url.includes('coolpc'))return new TextDecoder('big5').decode(fs.readFileSync(path.join(FIX,'coolpc-evaluate.html')));
    const u=new URL(url);const id=pchomeQueries[u.searchParams.get('q')];const f=path.join(FIX,`pchome-${id}-p${u.searchParams.get('page')}.json`);
    if(!id||!fs.existsSync(f))throw new Error('no fixture '+f);return fs.readFileSync(f,'utf8');
  }
  const res=await fetch(url,{headers:{'User-Agent':UA,'Accept-Language':'zh-TW,zh;q=0.9'},signal:AbortSignal.timeout(25000)});
  const buf=new Uint8Array(await res.arrayBuffer());
  await sleep(1500);
  if(!res.ok)throw new Error('HTTP '+res.status);
  return new TextDecoder(decode).decode(buf);
}

/* PChome 24h 搜尋 API：回傳 [{title,price,url}]。有價格範圍時加 price= 參數，先濾掉配件與整機。 */
async function pchome(cfg,band){
  const out=[];const pages=Math.min(cfg.pages||2,4);const sort=cfg.sort||'sale/dc';
  const range=band&&cfg.priceFilter!==false?`&price=${band[0]}-${band[1]}`:'';
  for(let page=1;page<=pages;page++){
    const url=`https://ecshweb.pchome.com.tw/search/v4.3/all/results?q=${encodeURIComponent(cfg.q)}&page=${page}&sort=${encodeURIComponent(sort)}${range}`;
    const j=JSON.parse(await get(url));
    for(const p of j.Prods||[])if(p&&p.Id&&typeof p.Price==='number')out.push({src:'pchome',title:String(p.Name||''),price:p.Price,url:`https://24h.pchome.com.tw/prod/${p.Id}`});
    if(!j.TotalPage||page>=j.TotalPage)break;
  }
  return out;
}

/* 原價屋線上報價頁：整頁抓一次，拆成 [{cat,group,title,price}] */
const ent=s=>String(s||'').replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(+d))
  .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
let coolpcCache=null;
async function coolpcAll(){
  if(coolpcCache)return coolpcCache;
  const html=await get('https://www.coolpc.com.tw/evaluate.php','big5');
  const items=[];const sels=[...html.matchAll(/<select[^>]*\bname=["']?(n\d+)["']?[^>]*>/gi)];
  sels.forEach((m,i)=>{
    const head=html.slice(Math.max(0,m.index-1500),m.index);const tds=[...head.matchAll(/<td class=t>([^<]*)/gi)];
    const cat=tds.length?ent(tds[tds.length-1][1]).trim():'';
    const body=html.slice(m.index+m[0].length,i+1<sels.length?sels[i+1].index:html.length);
    let group='';
    for(const t of body.matchAll(/<optgroup[^>]*label=["']([^"']*)["']|<option([^>]*)>([^<]*)/gi)){
      if(t[1]!==undefined){group=ent(t[1]).trim();continue}
      if(/\bdisabled\b/i.test(t[2]||''))continue;
      const text=ent(t[3]).trim();
      const pm=[...text.matchAll(/[,，]\s*\$\s?(\d+)(?:\s*↘\s*\$\s?(\d+))?/g)].pop();
      if(!pm)continue;
      items.push({src:'coolpc',cat,group,title:text.slice(0,pm.index).trim(),price:+(pm[2]||pm[1]),url:'https://www.coolpc.com.tw/evaluate.php'});
    }
  });
  if(items.length<500)throw new Error('原價屋報價頁格式可能改了（只解析到 '+items.length+' 筆）');
  return coolpcCache=items;
}
async function coolpc(cfg){
  const all=await coolpcAll();const cat=norm(cfg.cat||''),grp=norm(cfg.group||'');
  return all.filter(x=>(!cat||norm(x.cat).includes(cat))&&(!grp||norm(x.group).includes(grp)));
}
const SOURCES={pchome,coolpc};

/* ---------- plan ---------- */
function plan(now,calendar,runs){
  if(FORCE||FIX)return 'force';
  const last=runs[0]&&Date.parse(runs[0].at);
  if(last&&now-last<50*60e3)return null;
  for(const e of calendar.events||[]){
    if((e.type||'sale')!=='sale'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date||''))continue;
    const d=Date.parse(e.date+'T00:00:00+08:00');
    if(now>=d-3*864e5&&now<d+2*864e5)return 'sale:'+e.name;
  }
  const h=twHour(now);
  if(h===9||h===21)return 'routine';
  // GitHub 排程忙時可能延後；超過 12 小時沒追就補一次
  if(!last||now-last>12*36e5)return 'catch-up';
  return null;
}

/* ---------- main ---------- */
const now=new Date();
const calendar=readJSON(path.join(ROOT,'data','calendar.json'),{events:[]});
const runsFile=path.join(PDIR,'_runs.json');
const runs=readJSON(runsFile,[]);
const mode=plan(now,calendar,Array.isArray(runs)?runs:[]);
const ghOut=v=>{if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`changed=${v}\n`)};
if(!mode){console.log(`現在（台灣 ${twIso(now)}）不是追價時段，跳過。`);ghOut(false);process.exit(0)}

const products=fs.readdirSync(path.join(ROOT,'data','products')).filter(f=>f.endsWith('.json')).sort()
  .map(f=>readJSON(path.join(ROOT,'data','products',f),null)).filter(p=>p&&p.id);
for(const p of products)if(p.track&&p.track.pchome&&p.track.pchome.q)pchomeQueries[p.track.pchome.q]=p.id;

if(!DRY)fs.mkdirSync(PDIR,{recursive:true});
const t0=Date.now();const runLog={at:twIso(now),mode,sources:{},products:{}};
const report=[];
for(const p of products){
  const tr=p.track;if(!tr)continue;
  const base=Number(p.price&&(p.price.now??p.price.ref))||null;
  const band=Array.isArray(tr.band)&&tr.band.length===2?tr.band:base?[Math.round(base*.6),Math.round(base*1.8)]:null;
  const file=path.join(PDIR,p.id+'.json');
  const st=readJSON(file,{id:p.id,daily:[]});
  const src={};let cands=[];
  for(const [name,fn] of Object.entries(SOURCES)){
    const cfg=tr[name];if(!cfg)continue;
    try{
      const list=await fn(cfg,band);const ok=matcher(cfg,band);
      const kept=[];const why={};const rej=[];
      for(const c of list){const r=ok(c);if(r){why[r]=(why[r]||0)+1;rej.push({c,r})}else kept.push({...c,cond:condOf(c.title)})}
      kept.sort((a,b)=>a.price-b.price);
      src[name]={status:kept.length?'ok':'none',seen:list.length,n:kept.length,best:kept[0]?{p:kept[0].price,title:kept[0].title,url:kept[0].url,cond:kept[0].cond||undefined}:null,
        why,near:nearOf(rej,cfg)};
      cands.push(...kept);
      report.push(`  ${p.id.padEnd(24)} ${name.padEnd(6)} 看了 ${String(list.length).padStart(3)} 筆，符合 ${kept.length} 筆${kept[0]?`，最低 ${kept[0].price}「${kept[0].title.slice(0,46)}」`:''}  排除：${JSON.stringify(why)}`);
      runLog.sources[name]=runLog.sources[name]==='error'?'error':'ok';
    }catch(e){
      src[name]={status:'error',error:String(e.message||e).slice(0,160)};
      report.push(`  ${p.id.padEnd(24)} ${name.padEnd(6)} 失敗：${String(e.message||e).slice(0,120)}`);
      runLog.sources[name]='error';
    }
  }
  const plain=cands.filter(c=>!c.cond);const pool=plain.length?plain:cands;
  const best=pool.sort((a,b)=>a.price-b.price)[0]||null;
  const prev=st.latest&&st.latest.status==='ok'?st.latest:null;
  const ref=prev?prev.p:base;
  const at=twIso(now);
  let status;
  if(best){
    const change=ref?(best.price-ref)/ref:0;
    const obs={p:best.price,at,src:best.src,srcLabel:SRC_LABEL[best.src],title:best.title,url:best.url,cond:best.cond||undefined};
    if(ref&&Math.abs(change)>HOLD){status='held';st.held={...obs,ref,change:Math.round(change*1000)/1000}}
    else{
      status='ok';st.latest={...obs,status:'ok'};st.held=null;
      const d=twDate(now);const daily=Array.isArray(st.daily)?st.daily:[];const last=daily[daily.length-1];
      if(last&&last.d===d){if(best.price<=last.p)Object.assign(last,{p:best.price,src:SRC_LABEL[best.src]})}
      else daily.push({d,p:best.price,src:SRC_LABEL[best.src]});
      st.daily=daily.slice(-DAILY_MAX);
    }
  }else status=Object.values(src).some(s=>s.status==='ok'||s.status==='none')?'none':'error';
  Object.assign(st,{id:p.id,checkedAt:at,status,sources:src});
  runLog.products[p.id]=status;
  report.push(`→ ${p.id}: ${status}${best?` ${best.price}（${SRC_LABEL[best.src]}${best.cond?'・'+best.cond:''}）`:''}${ref?`，參考 ${ref}`:''}${st.held&&status==='held'?`，變動 ${(st.held.change*100).toFixed(1)}% 先擋下`:''}`);
  if(!DRY)writeJSON(file,st);
}
runLog.ms=Date.now()-t0;
console.log(`下單前 自動追價（${mode}，台灣 ${twIso(now)}）\n`+report.join('\n'));
if(!DRY){writeJSON(runsFile,[runLog,...(Array.isArray(runs)?runs:[])].slice(0,RUNS_MAX));ghOut(true)}
else ghOut(false);
