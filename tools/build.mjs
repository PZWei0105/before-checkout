#!/usr/bin/env node
/* 下單前：資料檢查＋打包
 *   node tools/build.mjs --check       只檢查 data/ 並印出判定表（推上 GitHub 前一定要跑，要看到 ✓）
 *   node tools/build.mjs --out _site   檢查後打包成網站（GitHub Actions 部署用）
 * 只用 Node 內建模組，不需要 npm install。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mergeAuto,SRC_LABEL} from './merge.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const E=require(path.join(ROOT,'engine.js'));
const args=process.argv.slice(2);
const CHECK=args.includes('--check');
const oi=args.indexOf('--out');
const OUT=oi>=0?path.resolve(args[oi+1]||'_site'):null;
if(!CHECK&&!OUT){console.log('用法：node tools/build.mjs --check   或   node tools/build.mjs --out _site');process.exit(2)}

const errors=[],warns=[];
const err=(f,m)=>errors.push(`✗ ${f}：${m}`);
const warn=(f,m)=>warns.push(`△ ${f}：${m}`);
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const isNumOrNull=x=>x===null||(typeof x==='number'&&Number.isFinite(x));
const isUrl=u=>{try{const x=new URL(u);return x.protocol==='https:'||x.protocol==='http:'}catch{return false}};
const ENUM={category:['gpu','phone','peripheral'],status:['on-sale','preorder','announced','discontinued','rumored'],trend:['up','flat','down','unknown'],
  level:['big','some','none','worse','na'],succ:['official','credible','rumor','none'],sev:['high','medium','low'],iss:['ongoing','fixed'],evtype:['sale','launch']};
const USES=E.USES.map(u=>u[0]);
const reDate=/^\d{4}-\d{2}-\d{2}$/,reEta=/^\d{4}-\d{2}(-\d{2})?$/,reId=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KNOWN=new Set(['id','name','brand','category','kind','tagline','status','launchDate','cycleMonths','checkedAt','lastRequest','track','price','specs','tests','gain','gainBasis','needs','successor','issues','alternatives','brief','learn','sources','priceLog']);
const twDate=d=>new Date(d.getTime()+8*36e5).toISOString().slice(0,10);

function readJSON(file){
  try{return JSON.parse(fs.readFileSync(file,'utf8'))}
  catch(e){err(path.relative(ROOT,file),'不是合法的 JSON（'+e.message+'）');return null}
}
function checkLinks(f,arr,label){
  if(arr==null)return;
  if(!Array.isArray(arr)){err(f,`${label} 要是陣列`);return}
  arr.forEach((x,i)=>{if(!isObj(x)){err(f,`${label}[${i}] 要是物件`);return}if(x.url!=null&&x.url!==''&&!isUrl(x.url))err(f,`${label}[${i}].url 不是 http(s) 網址`)});
}
function checkProduct(fn,p){
  const f='data/products/'+fn;
  if(!isObj(p)){err(f,'內容要是物件');return}
  const id=path.basename(fn,'.json');
  if(p.id!==id)err(f,`id「${p.id}」要和檔名「${id}」一樣`);
  if(!reId.test(id))err(f,'檔名／id 只能用小寫英數與連字號（例如 rtx-5070-ti）');
  if(typeof p.name!=='string'||!p.name.trim())err(f,'缺少 name');
  if(!ENUM.category.includes(p.category))err(f,`category 只能是 ${ENUM.category.join('/')}`);
  if(p.status!=null&&!ENUM.status.includes(p.status))err(f,`status 只能是 ${ENUM.status.join('/')}`);
  const chk=E.pd(p.checkedAt);
  if(!chk||!/T\d/.test(String(p.checkedAt)))err(f,'checkedAt 要是含時間的 ISO 字串，例如 2026-10-21T14:05:00+08:00');
  else if(chk.getTime()>Date.now()+36e5)err(f,'checkedAt 在未來');
  if(p.launchDate!=null&&!/^\d{4}-\d{2}(-\d{2})?$/.test(String(p.launchDate)))warn(f,'launchDate 建議用 YYYY-MM-DD');
  const P=p.price;
  if(!isObj(P))err(f,'缺少 price 物件');
  else{
    if(P.currency!=='TWD')err(f,'price.currency 要是 TWD');
    for(const k of ['now','ref','low90'])if(!isNumOrNull(P[k]??null)||(P[k]!=null&&P[k]<=0))err(f,`price.${k} 要是正數或 null`);
    if(P.range!=null&&!(Array.isArray(P.range)&&P.range.length===2&&P.range.every(x=>typeof x==='number')&&P.range[0]<=P.range[1]))err(f,'price.range 要是 [低, 高] 或 null');
    if(!ENUM.trend.includes(P.trend))err(f,`price.trend 只能是 ${ENUM.trend.join('/')}`);
    if(P.now!=null&&!P.nowSource)warn(f,'有現價但沒有 nowSource');
    if(P.nowUrl!=null&&P.nowUrl!==''&&!isUrl(P.nowUrl))err(f,'price.nowUrl 不是網址');
    if(P.now!=null&&Array.isArray(P.range)&&(P.now<P.range[0]*0.98||P.now>P.range[1]*1.02))warn(f,`現價 ${P.now} 不在價格區間 ${P.range.join('–')} 內`);
    checkLinks(f,P.trendSources,'price.trendSources');
  }
  if(!isObj(p.gain))err(f,'缺少 gain 物件');
  else for(const u of USES){const g=p.gain[u];if(g==null){warn(f,`gain.${u} 沒填（當作不相關）`);continue}
    if(!isObj(g)||!ENUM.level.includes(g.level))err(f,`gain.${u}.level 只能是 ${ENUM.level.join('/')}`);
    else if(!isNumOrNull(g.pct??null))err(f,`gain.${u}.pct 要是數字或 null`)}
  if(p.needs!=null&&(!isObj(p.needs)||typeof p.needs.desktop!=='boolean'))err(f,'needs.desktop 要是 true/false');
  const s=p.successor;
  if(s!=null){if(!isObj(s))err(f,'successor 要是物件');else{
    if(s.status!=null&&!ENUM.succ.includes(s.status))err(f,`successor.status 只能是 ${ENUM.succ.join('/')}`);
    if(s.eta!=null&&!reEta.test(String(s.eta)))err(f,'successor.eta 要是 YYYY-MM 或 null');
    checkLinks(f,s.sources,'successor.sources')}}
  if(p.issues!=null){if(!Array.isArray(p.issues))err(f,'issues 要是陣列');else p.issues.forEach((i,k)=>{
    if(!isObj(i)||!i.title){err(f,`issues[${k}] 缺少 title`);return}
    if(!ENUM.sev.includes(i.severity))err(f,`issues[${k}].severity 只能是 ${ENUM.sev.join('/')}`);
    if(!ENUM.iss.includes(i.status))err(f,`issues[${k}].status 只能是 ${ENUM.iss.join('/')}`);
    if(i.url&&!isUrl(i.url))err(f,`issues[${k}].url 不是網址`)})}
  for(const k of ['specs','tests','alternatives','learn'])if(p[k]!=null&&!Array.isArray(p[k]))err(f,`${k} 要是陣列`);
  (Array.isArray(p.tests)?p.tests:[]).forEach((t,k)=>{if(t&&t.url&&!isUrl(t.url))err(f,`tests[${k}].url 不是網址`)});
  checkLinks(f,p.sources,'sources');
  if(!Array.isArray(p.sources)||p.sources.length<2)warn(f,'來源少於 2 筆');
  if(p.priceLog!=null){if(!Array.isArray(p.priceLog))err(f,'priceLog 要是陣列');else{
    const seen=new Set();let prev='';
    p.priceLog.forEach((x,k)=>{
      if(!isObj(x)||!reDate.test(x.d||'')||typeof x.p!=='number'||x.p<=0){err(f,`priceLog[${k}] 要是 {"d":"YYYY-MM-DD","p":正數,"src":"通路"}`);return}
      if(seen.has(x.d))err(f,`priceLog 有兩筆 ${x.d}（同一天只留最新一筆）`);seen.add(x.d);
      if(x.d<prev)err(f,'priceLog 要依日期由舊到新排');prev=x.d});
    if(p.priceLog.length>60)err(f,'priceLog 最多 60 筆');
    const last=p.priceLog[p.priceLog.length-1];
    if(last&&isObj(P)&&P.now!=null&&chk&&last.d===twDate(chk)&&last.p!==P.now)warn(f,`今天的 priceLog（${last.p}）和 price.now（${P.now}）不一致`)}}
  for(const k of Object.keys(p))if(!KNOWN.has(k))warn(f,`多了不認識的欄位「${k}」（App 不會用到）`);
  checkTrack(f,p.track);
}
function checkTrack(f,t){
  if(t==null)return;
  if(!isObj(t)){err(f,'track 要是物件');return}
  if(t.band!=null&&!(Array.isArray(t.band)&&t.band.length===2&&t.band.every(x=>typeof x==='number'&&x>0)&&t.band[0]<t.band[1]))err(f,'track.band 要是 [最低價, 最高價]');
  const srcs=Object.keys(t).filter(k=>k!=='band');
  if(!srcs.length)warn(f,'track 沒有設定任何來源');
  for(const k of srcs){
    if(!SRC_LABEL[k]){err(f,`track.${k} 不是支援的來源（只能用 pchome、coolpc）`);continue}
    const c=t[k];if(!isObj(c)){err(f,`track.${k} 要是物件`);continue}
    if(k==='pchome'&&!(typeof c.q==='string'&&c.q.trim()))err(f,'track.pchome.q 要填搜尋關鍵字');
    if(k==='coolpc'&&!(typeof c.cat==='string'&&c.cat.trim()))err(f,'track.coolpc.cat 要填原價屋的分類（例如 顯示卡、影音、視訊）');
    for(const a of ['must','any','not'])if(c[a]!=null&&!(Array.isArray(c[a])&&c[a].every(x=>typeof x==='string')))err(f,`track.${k}.${a} 要是字串陣列`);
    if(!Array.isArray(c.must)||!c.must.length)warn(f,`track.${k}.must 沒填，容易比對到別的商品`);
  }
}

/* ---- 自動追價：data/prices/<id>.json 合併進商品（規則在 tools/merge.mjs） ---- */
function readPrices(){
  const dir=path.join(ROOT,'data','prices');const m={};let runs=[];
  if(!fs.existsSync(dir))return {prices:m,runs};
  for(const fn of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){
    try{const j=JSON.parse(fs.readFileSync(path.join(dir,fn),'utf8'));if(fn==='_runs.json')runs=Array.isArray(j)?j:[];else if(j&&j.id)m[j.id]=j}
    catch(e){warn('data/prices/'+fn,'讀不到（'+e.message+'），這次先不用')}
  }
  return {prices:m,runs};
}
function checkCalendar(c){
  const f='data/calendar.json';
  if(!isObj(c)||!Array.isArray(c.events)){err(f,'要是 {"updatedAt":"YYYY-MM-DD","events":[…]}');return}
  c.events.forEach((e,i)=>{
    if(!isObj(e)||!e.name){err(f,`events[${i}] 缺少 name`);return}
    if(!reDate.test(e.date||''))err(f,`events[${i}].date 要是 YYYY-MM-DD`);
    if(e.type!=null&&!ENUM.evtype.includes(e.type))err(f,`events[${i}].type 只能是 sale/launch`);
    if(!Array.isArray(e.categories)||!e.categories.every(x=>ENUM.category.includes(x)))err(f,`events[${i}].categories 只能用 gpu/phone/peripheral`);
    if(e.url&&!isUrl(e.url))err(f,`events[${i}].url 不是網址`)});
}
function checkProfile(p){
  const f='data/profile.json';
  if(!isObj(p)){err(f,'要是物件');return}
  if(!E.pd(p.updatedAt))err(f,'updatedAt 要是 ISO 時間');
  if(isObj(p.budget)&&Object.values(p.budget).some(v=>v!=null))err(f,'預算不可以寫進雲端（repo 是公開的），請拿掉 budget');
  if(!Array.isArray(p.uses)||!p.uses.every(u=>USES.includes(u)))err(f,`uses 只能用 ${USES.join('/')}`);
  if(p.desktopStatus!=null&&!Object.keys(E.DESK).includes(p.desktopStatus))err(f,'desktopStatus 只能是 none/planning/have');
  if(p.urgency!=null&&!Object.keys(E.URG).includes(p.urgency))err(f,'urgency 只能是 flexible/month/now');
  if(p.thr!=null)for(const m of E.THR_META){const v=p.thr[m.k];if(v!=null&&(typeof v!=='number'||v<m.min||v>m.max))err(f,`thr.${m.k} 要在 ${m.min}–${m.max}`)}
}

/* ---- load & check ---- */
const pdir=path.join(ROOT,'data','products');
const files=fs.readdirSync(pdir).filter(f=>f.endsWith('.json')).sort();
const products=[];
for(const fn of files){const p=readJSON(path.join(pdir,fn));if(p){checkProduct(fn,p);products.push(p)}}
const calendar=readJSON(path.join(ROOT,'data','calendar.json'));if(calendar)checkCalendar(calendar);
const profile=readJSON(path.join(ROOT,'data','profile.json'));if(profile)checkProfile(profile);

/* ---- 自動追價合併（判定表與網站都用合併後的價格） ---- */
const {prices,runs}=readPrices();
const nowMs=Date.now();
const merged=errors.length?[]:products.map(p=>{const q=JSON.parse(JSON.stringify(p));
  if(prices[p.id])mergeAuto(q,prices[p.id],nowMs);else if(p.track)q.auto={status:'pending'};
  delete q.track;return q});

console.log(`\n下單前 資料檢查：${products.length} 件商品、${calendar&&Array.isArray(calendar.events)?calendar.events.length:0} 個檔期\n`);
if(!errors.length&&profile&&calendar){
  const pr=E.normProfile({...profile,budget:{gpu:null,phone:null,peripheral:null}});
  console.log('雲端預設設定下的判定（PZ 手機上的預算與設定可能不同；價格「＊」＝採用自動追價）：');
  for(const p of merged){
    const r=E.evaluate(p,pr,{},{calendar:calendar.events});
    const hits=r.lines.filter(l=>l.status==='hit').map(l=>l.id).join(',')||'-';
    const price=E.money(p.price&&p.price.now)+(p.price&&p.price.nowBy==='auto'?'＊':'');
    console.log(`  ${p.id.padEnd(26)} ${E.V[r.verdict].label.padEnd(5,'　')} 觸發 ${hits.padEnd(9)} ${price.padEnd(14)} ${E.ageText(p.checkedAt)}`);
  }
  console.log('');
  const tracked=merged.filter(p=>p.auto);
  if(tracked.length){
    console.log(`自動追價：${tracked.length} 件有設定${runs[0]?`，最近一次 ${runs[0].at}（${runs[0].mode}）`:'，還沒跑過'}`);
    for(const p of tracked){const a=p.auto;
      console.log(`  ${p.id.padEnd(26)} ${String(a.status).padEnd(7)} ${a.latest?`${a.latest.p}（${a.latest.src}${a.latest.cond?'・'+a.latest.cond:''}）`:'—'}${a.held?`  待秘書確認 ${a.held.p}（${(a.held.change*100).toFixed(1)}%）`:''}`)}
    console.log('');
  }
}
for(const w of warns)console.log(w);
for(const e of errors)console.log(e);
if(errors.length){console.log(`\n資料有 ${errors.length} 個錯誤，請修正後再推。`);process.exit(1)}
console.log(`\n✓ 資料檢查通過${warns.length?`（${warns.length} 個提醒，不影響部署）`:''}`);

/* ---- build site ---- */
if(OUT){
  const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
  const tracker=runs[0]?{lastRun:runs[0],recent:runs.slice(0,10).map(r=>({at:r.at,mode:r.mode,sources:r.sources}))}:null;
  const buildId=crypto.createHash('sha256').update(JSON.stringify({profile,calendar,merged,tracker})+read('app.js')+read('engine.js')+read('updates.js')+read('app.css')+read('index.html')+read('sw.js')).digest('hex').slice(0,12);
  const latest=products.map(p=>E.pd(p.checkedAt)).filter(Boolean).sort((a,b)=>b-a)[0];
  const bundle={buildId,builtAt:new Date().toISOString(),dataAt:latest?latest.toISOString():null,profile,calendar,tracker,products:merged};
  fs.rmSync(OUT,{recursive:true,force:true});
  fs.mkdirSync(path.join(OUT,'data'),{recursive:true});
  for(const f of ['index.html','app.css','app.js','engine.js','updates.js','manifest.webmanifest'])fs.copyFileSync(path.join(ROOT,f),path.join(OUT,f));
  const sw=read('sw.js').replaceAll('__BUILD__',buildId);
  if(sw.includes('__BUILD__')||!sw.includes(`'bc-${buildId}'`)){console.log('✗ sw.js 的版本號沒有填入，請檢查 VERSION 那一行');process.exit(1)}
  fs.writeFileSync(path.join(OUT,'sw.js'),sw);
  fs.cpSync(path.join(ROOT,'icons'),path.join(OUT,'icons'),{recursive:true});
  fs.writeFileSync(path.join(OUT,'data','bundle.json'),JSON.stringify(bundle));
  fs.writeFileSync(path.join(OUT,'.nojekyll'),'');
  console.log(`✓ 網站已打包到 ${path.relative(process.cwd(),OUT)||OUT}（版本 ${buildId}）`);
}
