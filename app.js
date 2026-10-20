/* 下單前 BEFORE CHECKOUT — 獨立版 App
 * 資料：data/bundle.json（由 tools/build.mjs 從 data/ 打包）；個人設定存在這台裝置的 localStorage。
 * 判定：engine.js（與打包工具共用）。
 * 秘書：App 只負責把「委託單」與「問題」整理好複製，PZ 貼到 Claude 對話，秘書照 SECRETARY.md 查證後推回 GitHub。 */
(function(){
'use strict';
const E=window.BCEngine;
const {USES,USE_LABEL,CATS,V,V_ORDER,LV,URG,DESK,SUCC,TREND,DEFAULT_THR,THR_META,RULES,CONF,num,money,pctTxt,pd,daysUntil,daysSince,etaText,ageText,tail,lvOf}=E;

const REPO='PZWei0105/before-checkout';
const REPO_URL='https://github.com/'+REPO;
const CLAUDE_URL='https://claude.ai/new';
const LS={bundle:'bc.bundle.v1',profile:'bc.profile.v1',reqs:'bc.requests.v1',prefs:'bc.prefs.v1',install:'bc.install.v1'};
const store={
  get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}},
  del(k){try{localStorage.removeItem(k)}catch(e){}}
};
const SUGG={
  gpu:['用白話比較它跟我筆電的顯卡','如果只為了跑本機 AI，值得嗎？','現在等，價格會比較好嗎？'],
  phone:['跟我現在的手機比，實際差在哪？','我玩的手遊會有感嗎？','什麼情況下換機才划算？'],
  peripheral:['我真的需要它嗎？有沒有免費的替代？','要搭配什麼才能用？','跟其他牌子比差在哪？']
};
const ICON={
  gpu:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="11" rx="1.6"/><circle cx="8.6" cy="11.5" r="2.9"/><circle cx="15.4" cy="11.5" r="2.9"/><path d="M5.5 17v2.3M9 17v2.3"/></svg>',
  phone:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.8" y="2.5" width="10.4" height="19" rx="2.3"/><path d="M11 18.6h2"/></svg>',
  peripheral:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.8" y="7" width="12.6" height="10" rx="2"/><path d="m15.4 10.4 5.4-3v9.2l-5.4-3"/></svg>'
};
const reduceMotion=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};

/* ---------- state ---------- */
const S={products:{},calendar:[],repoProfile:null,builtAt:null,buildId:null,prodReady:false,fromCache:false,
  sync:'idle',syncedAt:null,lastTry:0,
  local:store.get(LS.profile,null),reqs:store.get(LS.reqs,[]),
  prefs:{haptics:true,sound:false,...store.get(LS.prefs,{})},
  view:'brief',fcat:'all',fv:'all',detail:null,whatIf:{},lastVerdict:null,dcat:'auto',
  meDirty:false,thrDirty:false,thrDraft:null,handoff:null,board:0,installEvt:null};
if(!Array.isArray(S.reqs))S.reqs=[];

/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=u=>{try{const x=new URL(String(u));return /^https?:$/.test(x.protocol)?x.href:null}catch(e){return null}};
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return ''}};
const link=(u,label)=>{const s=safeUrl(u);return s?`<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(label||host(s))}</a>`:esc(label||'')};
function hash(s){let h=2166136261;for(const c of String(s)){h^=c.codePointAt(0);h=Math.imul(h,16777619)}return h>>>0}
function hm(t){const d=new Date(t);return isNaN(d)?'':String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function md(t){const d=pd(t);return d?`${d.getMonth()+1}/${d.getDate()}`:'—'}
function mdhm(t){const d=pd(t);return d?`${d.getMonth()+1}/${d.getDate()} ${hm(d)}`:'—'}
const WD='日一二三四五六';
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{t.hidden=true},3400)}
function buzz(ms){if(!S.prefs.haptics||!navigator.vibrate)return;const ua=navigator.userActivation;if(ua&&!ua.hasBeenActive)return;try{navigator.vibrate(ms)}catch(e){}}
let AC=null;
function audioUnlock(){if(!S.prefs.sound)return;try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume()}catch(e){}}
function thump(){
  if(!S.prefs.sound||!AC)return;
  try{const t=AC.currentTime;
    const o=AC.createOscillator(),g=AC.createGain();o.type='sine';o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(46,t+.13);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.55,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.2);o.connect(g).connect(AC.destination);o.start(t);o.stop(t+.22);
    const len=Math.floor(AC.sampleRate*.07),buf=AC.createBuffer(1,len,AC.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);
    const n=AC.createBufferSource();n.buffer=buf;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=1700;const ng=AC.createGain();ng.gain.value=.28;
    n.connect(f).connect(ng).connect(AC.destination);n.start(t);
  }catch(e){}
}
function stampFx(delay){setTimeout(()=>{buzz(16);thump()},delay)}

/* 複製：先用 Clipboard API，不行就用隱藏 textarea。 */
function fallbackCopy(txt){const ta=document.createElement('textarea');ta.value=txt;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
  document.body.appendChild(ta);ta.select();try{ta.setSelectionRange(0,txt.length)}catch(e){}let ok=false;try{ok=document.execCommand('copy')}catch(e){}ta.remove();return ok}
function copyText(txt){
  try{if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(txt).then(()=>true,()=>fallbackCopy(txt))}catch(e){}
  return Promise.resolve(fallbackCopy(txt));
}

/* ---------- profile：雲端預設＋這台裝置的修改 ---------- */
function repoUpdated(){const d=pd(S.repoProfile&&S.repoProfile.updatedAt);return d?d.getTime():0}
function localData(){return (S.local&&S.local.data)||null}
function hasLocalOverrides(){const L=localData();return !!L&&Object.keys(L).some(k=>k!=='budget')}
function prof(){
  const base=E.normProfile({...(S.repoProfile||{}),budget:{gpu:null,phone:null,peripheral:null}});
  const L=localData();if(!L)return base;
  return E.normProfile({...base,...L,gear:{...base.gear,...(L.gear||{})},thr:{...base.thr,...(L.thr||{})},budget:{...base.budget,...(L.budget||{})}});
}
function repoNewer(){return hasLocalOverrides()&&repoUpdated()>((S.local&&S.local.seenRepo)||0)}
function saveLocal(patch,msg){
  const cur=localData()||{};
  S.local={savedAt:Date.now(),seenRepo:Math.max(repoUpdated(),(S.local&&S.local.seenRepo)||0),data:{...cur,...patch}};
  const ok=store.set(LS.profile,S.local);
  toast(ok?(msg||'已儲存'):'已套用，但這個瀏覽器不能存檔，關掉 App 後會還原。');
  renderAll();return true;
}
function resetToCloud(){
  const L=localData()||{};const keep=L.budget?{budget:L.budget}:{};
  S.local=Object.keys(keep).length?{savedAt:Date.now(),seenRepo:repoUpdated(),data:keep}:null;
  if(S.local)store.set(LS.profile,S.local);else store.del(LS.profile);
  S.meDirty=false;S.thrDraft=null;S.thrDirty=false;toast('已改回雲端預設（預算保留在這台裝置）');renderAll();
}
function keepLocal(){if(!S.local)return;S.local.seenRepo=repoUpdated();store.set(LS.profile,S.local);renderAll()}

/* ---------- evaluation ---------- */
const evalP=(p,over,pr)=>E.evaluate(p,pr||prof(),over,{calendar:S.calendar});
function allEvals(){const pr=prof();return Object.values(S.products).map(p=>({p,r:evalP(p,{},pr)}))}

/* ---------- small renderers ---------- */
function stamp(v,size,extra){return `<span class="stamp ${size||''} v-${v}${extra?' '+extra:''}">${V[v].label}${size==='lg'?`<small>${V[v].en}</small>`:''}</span>`}
function barcode(seed){let h=hash(seed)||1,x=0,out='';const W=210,H=36;
  while(x<W-3){h=(Math.imul(h^(h>>>15),2246822507)+3266489909)>>>0;const w=1+(h%3),g=1+((h>>>7)%3);out+=`<rect x="${x}" y="0" width="${w}" height="${H}"/>`;x+=w+g}
  return `<svg class="barcode" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" fill="currentColor" aria-hidden="true">${out}</svg>`}
function logPts(p){return (Array.isArray(p.priceLog)?p.priceLog:[]).map(x=>({d:pd(x&&x.d),p:num(x&&x.p),src:x&&x.src})).filter(x=>x.d&&x.p!=null).sort((a,b)=>a.d-b.d)}
function spark(p){const a=autoPts(p);const pts=a.length>=2?a:logPts(p);const W=64,H=22;if(!pts.length)return '';
  if(pts.length===1)return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><line class="sp-base" x1="0" y1="${H/2}" x2="${W}" y2="${H/2}"/><circle class="sp-end" cx="${W-4}" cy="${H/2}" r="2.6"/></svg>`;
  const t0=pts[0].d.getTime(),t1=pts[pts.length-1].d.getTime()||t0+1;const ps=pts.map(x=>x.p);const lo=Math.min(...ps),hi=Math.max(...ps);const sp=hi-lo||1;
  const X=t=>3+(t-t0)/((t1-t0)||1)*(W-7),Y=v=>H-3-(v-lo)/sp*(H-6);
  const d=pts.map((x,i)=>(i?'L':'M')+X(x.d.getTime()).toFixed(1)+' '+Y(x.p).toFixed(1)).join(' ');const e=pts[pts.length-1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path class="sp-area" d="${d} L${X(e.d.getTime()).toFixed(1)} ${H} L3 ${H} Z"/><path class="sp-line" d="${d}"/><circle class="sp-end" cx="${X(e.d.getTime()).toFixed(1)}" cy="${Y(e.p).toFixed(1)}" r="2.6"/></svg>`}
function autoPts(p){return (p.auto&&Array.isArray(p.auto.daily)?p.auto.daily:[]).map(x=>({d:pd(x&&x.d),p:num(x&&x.p),src:x&&x.src})).filter(x=>x.d&&x.p!=null).sort((a,b)=>a.d-b.d)}
/* 走勢圖：自動追價連成線（每天一點），秘書查證畫成圓點；只有秘書紀錄時就用秘書的連線 */
function priceChart(p){
  const auto=autoPts(p),sec=logPts(p);const ref=num((p.price||{}).ref);
  const line=auto.length>=2?auto:sec,dots=auto.length>=2?sec:[];
  if(line.length<2){
    const first=[...auto,...sec].sort((a,b)=>a.d-b.d)[0];
    return `<p class="small muted">價格紀錄從${first?' '+(first.d.getMonth()+1)+'/'+first.d.getDate()+' ':'今天'}開始。${p.auto?'自動追價每天記錄，':'每次請秘書重查都會多記一筆，'}走勢很快就會長出來。</p>`}
  const all=[...line,...dots];
  const W=320,H=128,L=8,R=58,T=12,B=30;const ps=all.map(x=>x.p).concat(ref!=null?[ref]:[]);let lo=Math.min(...ps),hi=Math.max(...ps);const padv=(hi-lo)*0.12||hi*0.03||1;lo-=padv;hi+=padv;
  const t0=Math.min(...all.map(x=>x.d.getTime())),t1=Math.max(...all.map(x=>x.d.getTime()));
  const X=t=>L+(t-t0)/((t1-t0)||1)*(W-L-R),Y=v=>T+(1-(v-lo)/(hi-lo))*(H-T-B);
  const d=line.map((x,i)=>(i?'L':'M')+X(x.d.getTime()).toFixed(1)+' '+Y(x.p).toFixed(1)).join(' ');const e=line[line.length-1];
  const k=v=>Math.round(v/1000*10)/10+'k';const f=x=>`${x.getMonth()+1}/${x.getDate()}`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="價格走勢，${line.length} 筆紀錄">
    <line class="c-grid" x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}"/>
    ${ref!=null?`<line class="c-ref" x1="${L}" y1="${Y(ref).toFixed(1)}" x2="${W-R}" y2="${Y(ref).toFixed(1)}"/><text x="${W-R+4}" y="${(Y(ref)+3).toFixed(1)}">參考 ${k(ref)}</text>`:''}
    <path class="c-area" d="${d} L${X(e.d.getTime()).toFixed(1)} ${H-B} L${X(line[0].d.getTime()).toFixed(1)} ${H-B} Z"/><path class="c-line" d="${d}"/>
    ${dots.map(x=>`<circle class="c-dot" cx="${X(x.d.getTime()).toFixed(1)}" cy="${Y(x.p).toFixed(1)}" r="3"/>`).join('')}
    <circle class="c-end" cx="${X(e.d.getTime()).toFixed(1)}" cy="${Y(e.p).toFixed(1)}" r="3.5"/>
    <text x="${W-R+4}" y="${(Y(e.p)+3).toFixed(1)}">${k(e.p)}</text>
    <text x="${L}" y="${H-B+13}">${f(new Date(t0))}</text>
    <text x="${W-R}" y="${H-B+13}" text-anchor="end">${f(new Date(t1))}</text>
    ${auto.length>=2?`<text x="${L}" y="${H-3}">— 自動追價（每天）${dots.length?'　● 秘書查證':''}</text>`:''}
  </svg>`}

/* ---------- 自動追價 ---------- */
const chg=x=>`比上次${x>=0?'高':'低'} ${Math.abs(x*100).toFixed(0)}%`;
function autoLineHTML(p){
  const a=p.auto;if(!a)return '';
  const P=p.price||{};const L=a.latest;const t=a.checkedAt?mdhm(a.checkedAt):'';
  if(a.status==='held'&&a.held)return `<p class="auto held">⚠ 自動追價 ${esc(t)} 抓到 ${esc(a.held.src)} ${money(a.held.p)}（${chg(a.held.change)}），可能是特價或比對錯誤，先不採用，等秘書確認。</p>`;
  if(a.status==='ok'&&L){const used=P.nowBy==='auto';
    return `<p class="auto${used?' on':''}">⟳ 自動追價 ${esc(t)}：${esc(L.src)} ${money(L.p)}${L.cond?`（${esc(L.cond)}）`:''}${used?'，判定採用這個價格':P.now!=null&&L.p>P.now?'；秘書查到的更便宜，判定先用秘書的':''}</p>`}
  if(a.status==='none')return `<p class="auto">⟳ 自動追價 ${esc(t)}：PChome、原價屋目前都沒有單賣這一款${L?`（上次 ${esc(mdhm(L.at))} 是 ${esc(L.src)} ${money(L.p)}）`:''}，價格以秘書查證為準。</p>`;
  if(a.status==='error')return `<p class="auto">⟳ 自動追價這次連不上通路，下次會再試${L?`（上次 ${esc(mdhm(L.at))} 是 ${money(L.p)}）`:''}。</p>`;
  return '<p class="auto">⟳ 已設定自動追價，等第一次執行。</p>';
}
function autoCardHTML(p){
  const a=p.auto;const P=p.price||{};
  if(!a)return '<p class="small muted">這件沒有設定自動追價，價格以秘書查證為準。</p>';
  const rows=Object.values(a.sources||{}).map(s=>`<li><span class="as-n">${esc(s.label)}</span>${s.best?`<b class="mono">${money(s.best.p)}</b><span class="as-t">${link(s.best.url,s.best.title)}${s.best.cond?`（${esc(s.best.cond)}）`:''}</span>`:`<span class="as-t muted">${s.status==='error'?'這次連不上':'目前沒有單賣'}</span>`}</li>`).join('');
  const used=P.nowBy==='auto'?`判定採用自動追價 ${money(P.now)}${P.secNow&&P.secNow.p!=null?`，比秘書查到的 ${money(P.secNow.p)} 低`:''}。`
    :a.latest&&a.status==='ok'&&P.now!=null?`判定採用秘書查到的 ${money(P.now)}：比自動追價低，而且是 7 天內的查證。`:'';
  return `<div class="autobox"><div class="ab-h"><b>⟳ 自動追價</b><span class="small muted">${a.checkedAt?esc(mdhm(a.checkedAt)):'尚未執行'}</span></div>
    ${rows?`<ul class="auto-src">${rows}</ul>`:''}${used?`<p class="small">${used}</p>`:''}
    ${a.held?`<p class="small held">⚠ 待秘書確認：${esc(a.held.src)} ${money(a.held.p)}（${chg(a.held.change)}）。<button type="button" class="btn-link" data-act="refresh" data-id="${esc(p.id)}">請秘書重查</button></p>`:''}
    <p class="small muted">每天早晚各追一次，大促前後每小時。只用條款允許的通路：PChome 24h、原價屋。</p></div>`;
}
/* 下一次追價時間（台灣時間）：大促前 3 天到隔天每小時，其餘 09:07、21:07 */
function nextRunText(){
  const now=Date.now();const TW=8*36e5;
  const inSale=t=>(S.calendar||[]).some(e=>(e.type||'sale')==='sale'&&/^\d{4}-\d{2}-\d{2}$/.test(e.date||'')&&(()=>{const d=Date.parse(e.date+'T00:00:00+08:00');return t>=d-3*864e5&&t<d+2*864e5})());
  for(let h=0;h<=25;h++){const t=Math.floor((now+TW)/36e5)*36e5-TW+h*36e5+7*6e4;if(t<=now)continue;const hr=new Date(t+TW).getUTCHours();if(inSale(t)||hr===9||hr===21)return hm(t)}
  return '—';
}
const resTxt=l=>l.status==='pass'?'過關':l.status==='hit'?'● '+V[l.effect].label:l.status==='info'?'提醒':'跳過';

/* ---------- views ---------- */
const VIEWS=['brief','list','rules','me'];
function setView(v,opts){
  if(!VIEWS.includes(v))v='brief';
  S.view=v;
  for(const k of VIEWS)$('#view-'+k).hidden=k!==v;
  document.querySelectorAll('.tab').forEach(t=>{if(t.dataset.view===v)t.setAttribute('aria-current','page');else t.removeAttribute('aria-current')});
  if(v==='brief')renderBrief();
  if(v==='list')renderList();
  if(v==='rules'){S.thrDirty=false;S.thrDraft=null;renderThr()}
  if(v==='me'){S.meDirty=false;renderMe()}
  if(!(opts&&opts.keepHash)){try{history.replaceState(null,'',v==='brief'?location.pathname+location.search:'#'+v)}catch(e){}}
  window.scrollTo(0,0);
}

function renderSync(){
  const el=$('#sync');const t=el.querySelector('span');el.className='pill';
  if(S.sync==='syncing'){el.classList.add('syncing');t.textContent='同步中'}
  else if(S.sync==='ok'){el.classList.add('ok');t.textContent='已同步 '+hm(S.syncedAt)}
  else if(S.sync==='offline'){el.classList.add('off');t.textContent='離線・'+md(S.builtAt)+' 版'}
  else if(S.sync==='error'){el.classList.add('err');t.textContent='連不上'}
  else t.textContent='連線中';
}

/* 客顯看板：輪播下一個大促、新品、清單統計、資料版本 */
function boardMsgs(){
  const out=[];const ev=allEvals();const cnt={buy:0,wait:0,next:0,skip:0};ev.forEach(x=>cnt[x.r.verdict]++);
  const up=upcoming();
  const sale=up.find(x=>x.kind==='event');
  if(sale)out.push({top:'NEXT SALE',name:sale.title,big:sale.left===0?'TODAY':'T-'+sale.left,unit:sale.left===0?'':'DAYS',sub:`${sale.date.getMonth()+1}/${sale.date.getDate()}（${WD[sale.date.getDay()]}）・${sale.cats||''}`});
  const launch=up.find(x=>x.kind==='launch'&&!x.month&&x.left>=0);
  if(launch)out.push({top:'NEXT LAUNCH',name:launch.title,big:launch.left===0?'TODAY':'T-'+launch.left,unit:launch.left===0?'':'DAYS',sub:`${launch.date.getMonth()+1}/${launch.date.getDate()}（${WD[launch.date.getDay()]}）・${launch.cats||'新品'}`});
  if(ev.length)out.push({top:'CHECKOUT LIST',name:`清單 ${ev.length} 件`,big:'BUY '+cnt.buy,unit:'',sub:`HOLD ${cnt.wait} ・ NEXT ${cnt.next} ・ SKIP ${cnt.skip}`});
  const tracked=ev.filter(x=>x.p.auto);
  if(tracked.length){const got=tracked.filter(x=>x.p.auto.latest).length;const last=S.tracker&&S.tracker.lastRun;
    out.push({top:'PRICE BOT',name:'自動追價',big:`${got}/${tracked.length}`,unit:'ITEMS',sub:last?`最近 ${mdhm(last.at)}・下一次 ${nextRunText()}`:'等第一次執行'})}
  if(S.dataAt)out.push({top:'LAST CHECK',name:'最新查證',big:md(S.dataAt),unit:hm(pd(S.dataAt)),sub:S.sync==='offline'?'離線中・連上網路後下拉同步':'下拉畫面就能同步最新資料'});
  if(!out.length)out.push({top:'BEFORE CHECKOUT',name:'',big:'READY',unit:'',sub:'正在整理你的清單'});
  return out;
}
function renderBoard(flick){
  const msgs=boardMsgs();S.board=S.board%msgs.length;const m=msgs[S.board];
  const el=$('#board');
  el.innerHTML=`<span class="vfd-row vfd-sm"><span>${esc(m.top)}</span><span>${esc(m.name)}</span></span>
    <span class="vfd-row vfd-big${flick&&!reduceMotion()?' flick':''}"><span>${esc(m.big)}<span class="b-unit">${esc(m.unit)}</span></span></span>
    <span class="vfd-row vfd-sm"><span>${esc(m.sub)}</span></span>
    <span class="b-dots" aria-hidden="true">${msgs.map((_,i)=>`<i class="${i===S.board?'on':''}"></i>`).join('')}</span>`;
  el.setAttribute('aria-label',`${m.top} ${m.name} ${m.big} ${m.unit} ${m.sub}`);
}
function nextBoard(){const n=boardMsgs().length;if(n>1)S.board++;renderBoard(n>1)}

function renderBrief(){
  const pr=prof();const ev=allEvals();const cnt={buy:0,wait:0,next:0,skip:0};ev.forEach(x=>cnt[x.r.verdict]++);
  const d=new Date();$('#memo-date').textContent=`${d.getMonth()+1}/${d.getDate()}（${WD[d.getDay()]}）${hm(d)}`;
  const h=d.getHours();const hi=h<5?'夜深了':h<11?'早安':h<18?'午安':'晚安';const who=pr.name||'老闆';
  const up=upcoming().filter(x=>x.kind==='event')[0];
  let t;
  if(!S.prodReady)t=S.sync==='error'?'連不上資料，也還沒有存檔。確認網路後，點右上角重新同步。':'正在整理你的清單…';
  else if(!ev.length)t=`${hi}，${esc(who)}。清單還是空的：在下面開一張委託單，請秘書查第一件。`;
  else t=`${hi}，${esc(who)}。清單裡 <b>${ev.length}</b> 件：可以下單 <b>${cnt.buy}</b>、建議再等 <b>${cnt.wait}</b>、等新一代 <b>${cnt.next}</b>、不用買 <b>${cnt.skip}</b>。`+(up?`距離${esc(tail(up.title))}還有 <b>${up.left}</b> 天。`:'');
  if(S.prodReady&&S.sync==='offline')t+=`<span class="off">目前離線，顯示 ${esc(mdhm(S.builtAt))} 的資料。</span>`;
  $('#memo-text').innerHTML=t;
  $('#tally').innerHTML=V_ORDER.map(v=>`<button type="button" class="v-${v}" data-act="tally" data-val="${v}" aria-label="${V[v].label} ${cnt[v]} 件"><b>${S.prodReady?cnt[v]:'–'}</b><span>${V[v].label}</span></button>`).join('');
  renderBoard(false);renderInstall();renderTickets();renderUpcoming();renderAttention(ev);
}

function upcoming(){
  const out=[];
  for(const e of S.calendar||[]){const n=daysUntil(e.date);if(n==null||n<0||n>120)continue;const sale=(e.type||'sale')==='sale';
    const cats=(e.categories||[]).map(c=>(CATS[c]||{}).label).filter(Boolean).join('・');
    out.push({kind:sale?'event':'launch',date:pd(e.date),left:n,title:e.name,cats,sub:(sale?'促銷・':'上市・')+cats+(e.note?' · '+e.note:''),url:e.url})}
  const seen=new Set();
  for(const p of Object.values(S.products)){const s=p.successor;if(!s||!s.name||!s.eta||s.status==='none')continue;const n=daysUntil(s.eta);if(n==null||n<-15||n>548)continue;
    const key=s.name+'|'+s.eta;if(seen.has(key)){const it=out.find(x=>x.key===key);if(it)it.sub+='、'+p.name;continue}seen.add(key);
    out.push({kind:'launch',key,date:pd(s.eta),left:n,title:s.name,cats:(CATS[p.category]||{}).label,sub:`${SUCC[s.status]||s.status} · 影響 ${p.name}`,month:!/^\d{4}-\d{1,2}-\d{1,2}/.test(String(s.eta))})}
  return out.sort((a,b)=>a.date-b.date).slice(0,7);
}
function renderUpcoming(){
  const it=upcoming();const el=$('#upcoming');
  if(!S.prodReady){el.innerHTML='<li><span class="d">—</span><span class="t"><b>載入中</b></span><span></span></li>';return}
  if(!it.length){el.innerHTML='<li><span class="d">—</span><span class="t"><b>近期沒有排定的大促或新品</b><span>請秘書查新商品後，它們的新一代時程會出現在這裡。</span></span><span></span></li>';return}
  el.innerHTML=it.map(x=>{const dd=x.month?`${x.date.getFullYear()}<br>${x.date.getMonth()+1} 月`:`${x.date.getMonth()+1}/${x.date.getDate()}`;
    const left=x.left<0?'已推出':x.month?`約 ${Math.max(1,Math.round(x.left/30.44))} 個月`:x.left===0?'今天':`${x.left} 天`;
    return `<li><span class="d">${dd}</span><span class="t"><b>${x.url?link(x.url,x.title):esc(x.title)}</b><span>${esc(x.sub)}</span></span><span class="left">${left}</span></li>`}).join('');
}
function renderAttention(ev){
  const el=$('#attention');if(!S.prodReady){el.innerHTML='<li>載入中</li>';return}
  const out=[];const pr=prof();
  if(repoNewer())out.push(`秘書更新了你的雲端預設設定（${esc(md(S.repoProfile.updatedAt))}）。<button type="button" class="btn-link" data-act="tab" data-view="me">去看看要不要套用</button>`);
  if(!['gpu','phone','peripheral'].some(c=>num(pr.budget[c])!=null))out.push(`還沒設定預算。到「我」填上顯卡、手機、周邊預算，判定會更貼近你。<button type="button" class="btn-link" data-act="tab" data-view="me">去設定</button>`);
  for(const {p,r} of ev){
    const a=p.auto;
    if(a&&a.status==='held'&&a.held)out.push(`<b>待秘書確認</b>：${esc(p.name)} 在 ${esc(a.held.src)} 出現 ${money(a.held.p)}（${chg(a.held.change)}），可能是特價或比對錯誤。<button type="button" class="btn-link" data-act="open" data-id="${esc(p.id)}">看單</button>`);
    const dl=autoPts(p);
    if(dl.length>=2){const x=dl[dl.length-1],y=dl[dl.length-2];const c=(x.p-y.p)/y.p;const age=daysSince(x.d);
      if(c<=-0.03&&age!=null&&age<=1)out.push(`<b>降價</b>：${esc(p.name)} ${esc(x.src||'')} ${money(x.p)}，比前一次低 ${Math.round(-c*100)}%（${money(y.p)}）。<button type="button" class="btn-link" data-act="open" data-id="${esc(p.id)}">看單</button>`)}
    const P1=r.lines.find(l=>l.id==='P1');
    if(r.verdict==='wait'&&P1&&P1.status==='hit'&&r.now!=null&&r.target!=null){const gap=r.now-r.target;if(gap>0&&gap/r.now<0.06)out.push(`${esc(p.name)} 再降 ${money(gap)}，價格這關就過了。<button type="button" class="btn-link" data-act="open" data-id="${esc(p.id)}">看單</button>`)}
    if(r.age!=null&&r.age>r.thr.freshDays)out.push(`${esc(p.name)} 已 ${r.age} 天沒查證。<button type="button" class="btn-link" data-act="refresh" data-id="${esc(p.id)}">請秘書重查</button>`);
    const s=p.successor;const n=s&&daysUntil(s.eta);if(s&&s.name&&s.status&&s.status!=='rumor'&&s.status!=='none'&&n!=null&&n>=0&&n<=60)out.push(`${esc(s.name)} 約 ${n} 天後上市，會影響 ${esc(p.name)} 的判定。`);
  }
  for(const q of S.reqs){const st=reqStatus(q);if(!st.done&&(Date.now()-q.createdAt)/36e5>3&&(Date.now()-q.createdAt)/864e5<3)out.push(`委託「${esc(q.q)}」（${esc(q.code)}）還沒回來。確認你有把委託單貼到 Claude 並送出。<button type="button" class="btn-link" data-act="req-copy" data-code="${esc(q.code)}">再複製一次</button>`)}
  el.innerHTML=out.length?out.slice(0,6).map(x=>`<li><span>${x}</span></li>`).join(''):'<li><span>目前沒有需要你處理的事。</span></li>';
}

function segHTML(items,cur,act){return items.map(([k,l])=>`<button type="button" role="radio" aria-checked="${k===cur}" data-act="${act}" data-val="${k}">${l}</button>`).join('')}
function renderDispatchSeg(){$('#d-cat').innerHTML=segHTML([['auto','自動判斷'],['gpu','顯卡'],['phone','手機'],['peripheral','周邊']],S.dcat,'dcat')}

/* ---------- 委託單 ---------- */
function newCode(){const t=Date.now().toString(36).toUpperCase();const r=Math.floor(Math.random()*36*36).toString(36).toUpperCase().padStart(2,'0');return 'R-'+t.slice(-4)+r}
function reqText(r){
  const cat=r.category&&CATS[r.category]?CATS[r.category].label:'自動判斷';
  const L=[`【下單前・秘書委託 ${r.code}】`];
  if(r.kind==='refresh')L.push(`請重新查證我的《下單前》App 裡的「${r.q}」（data/products/${r.productId}.json）：更新台灣現價與走勢、下一代消息、已知問題和實測。`);
  else L.push(`請幫我的《下單前》App 查一件新商品：${r.q}（類別：${cat}）。`);
  if(r.note)L.push(`我的補充：${r.note}`);
  L.push(`做法：照 GitHub 上 ${REPO} 這個 repo 裡的 SECRETARY.md 進行（查證 → 寫進 data/ → 跑 node tools/build.mjs --check 驗證 → 推上 main）。商品資料的 lastRequest 請填 ${r.code}。`);
  return L.join('\n');
}
function reqStatus(r){
  const hit=Object.values(S.products).find(x=>x.lastRequest===r.code);
  if(hit)return {done:true,p:hit};
  const p=r.productId&&S.products[r.productId];
  if(r.kind==='refresh'&&p){const c=pd(p.checkedAt);if(c&&c.getTime()>r.createdAt)return {done:true,p}}
  return {done:false};
}
function saveReqs(){S.reqs=S.reqs.slice(0,20);store.set(LS.reqs,S.reqs)}
function addRequest(o){
  const r={code:newCode(),kind:o.productId?'refresh':'new',q:o.q,productId:o.productId||null,category:o.category||'auto',note:o.note||'',createdAt:Date.now()};
  S.reqs.unshift(r);saveReqs();return r;
}
function handoff(r){
  const txt=reqText(r);
  return copyText(txt).then(ok=>{
    r.copied=!!ok;saveReqs();
    if(ok)toast(`委託單 ${r.code} 已複製，到 Claude 貼上送出`);else copyFallback(txt,`委託單 ${r.code}`);
    renderTickets();if(S.detail)renderHandoff();return ok;
  });
}
/* 自動複製失敗時：把文字放進可以長按全選的框 */
function copyFallback(txt,title){
  let el=$('#copyfb');
  if(!el){el=document.createElement('div');el.id='copyfb';el.className='copyfb';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');document.body.appendChild(el)}
  el.innerHTML=`<div class="copyfb-card"><div class="card-h"><h3>${esc(title||'手動複製')}</h3><button type="button" class="btn-ghost" data-act="copyfb-close">關閉</button></div>
    <p class="small muted">這個瀏覽器不讓 App 自動複製。長按下面的文字，選「全選」再「拷貝」，貼到 Claude 對話送出。</p>
    <textarea class="input mono" readonly rows="9">${esc(txt)}</textarea></div>`;
  el.hidden=false;const ta=el.querySelector('textarea');setTimeout(()=>{try{ta.focus();ta.select()}catch(e){}},50);
}
function copyOrFallback(txt,title,okMsg){return copyText(txt).then(ok=>{if(ok)toast(okMsg);else copyFallback(txt,title);return ok})}
function checkRequests(){
  let changed=false;
  for(const r of S.reqs){if(r.doneAt)continue;const st=reqStatus(r);if(st.done){r.doneAt=Date.now();r.productId=st.p.id;changed=true;toast(`秘書回報：${st.p.name} 已更新`);buzz([12,60,12])}}
  const before=S.reqs.length;S.reqs=S.reqs.filter(r=>!(r.doneAt&&Date.now()-r.doneAt>7*864e5));
  if(changed||before!==S.reqs.length)saveReqs();
}
function ticketHTML(r){
  const st=reqStatus(r);const mins=Math.round((Date.now()-r.createdAt)/6e4);
  const age=mins<1?'剛剛':mins<60?`${mins} 分鐘前`:mins<1440?`${Math.round(mins/60)} 小時前`:`${Math.round(mins/1440)} 天前`;
  const stale=!st.done&&mins>180;
  const cls=st.done?'st-done':stale?'st-stale':'st-wait';
  const label=st.done?'完成':stale?'還沒回來':'等秘書回報';
  let body='';
  if(st.done)body=`<div class="tk-acts"><button type="button" class="btn" data-act="open" data-id="${esc(st.p.id)}">看判定 →</button><span class="tk-note">${esc(ageText(st.p.checkedAt))}</span></div>`;
  else body=`<p class="tk-note">${r.kind==='refresh'?'重查':'新商品'}・${age}開單。${r.copied===false?'剛才沒有自動複製，按「再複製一次」。':'已複製，貼到 Claude 對話送出就好。'}</p>
    <div class="tk-acts"><a class="btn" href="${CLAUDE_URL}" target="_blank" rel="noopener">開啟 Claude ↗</a><button type="button" class="btn" data-act="req-copy" data-code="${esc(r.code)}">再複製一次</button></div>`;
  return `<li class="ticket ${cls}"><div class="tk-h"><span class="tk-q">${esc(r.q)}<span class="tk-code">${esc(r.code)}</span></span><span class="row" style="gap:6px;flex:none"><span class="tk-st">${label}</span><button type="button" class="tk-x" data-act="del-req" data-code="${esc(r.code)}" aria-label="移除這張委託">×</button></span></div>${body}</li>`;
}
function renderTickets(){const el=$('#tickets');el.innerHTML=S.reqs.slice(0,6).map(ticketHTML).join('')}

/* ---------- 加到主畫面 ---------- */
const isStandalone=()=>{try{return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}catch(e){return false}};
function renderInstall(){
  const el=$('#install');
  if(isStandalone()||store.get(LS.install,false)){el.innerHTML='';return}
  const ua=navigator.userAgent||'';const ios=/iP(hone|ad|od)/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const steps=ios?'用 <b>Safari</b> 打開這個網址，點下方的<b>分享</b>按鈕，再點<b>加入主畫面</b>。之後從主畫面點開，就是全螢幕的 App。'
    :S.installEvt?'按下面的「安裝」，主畫面就會多一個《下單前》。':'用 <b>Chrome</b> 打開這個網址，點右上角 <b>⋮</b>，選<b>安裝應用程式</b>或<b>加到主畫面</b>。';
  el.innerHTML=`<section class="card install"><div class="card-h"><h2>放到主畫面</h2><span class="eyebrow">INSTALL</span></div><p class="small">${steps}</p>
    <div class="row">${S.installEvt?'<button type="button" class="btn btn-seal" data-act="install">安裝</button>':''}<button type="button" class="btn-ghost" data-act="hide-install">知道了</button></div></section>`;
}

/* ---------- list ---------- */
function renderList(){
  const ev=allEvals();
  $('#f-cat').innerHTML=segHTML([['all','全部'],['gpu','顯卡'],['phone','手機'],['peripheral','周邊']],S.fcat,'fcat');
  $('#f-v').innerHTML=V_ORDER.map(v=>`<button type="button" class="chip" aria-pressed="${S.fv===v}" data-act="fv" data-val="${v}">${V[v].label}</button>`).join('');
  const rows=ev.filter(x=>(S.fcat==='all'||x.p.category===S.fcat)&&(S.fv==='all'||x.r.verdict===S.fv))
    .sort((a,b)=>V_ORDER.indexOf(a.r.verdict)-V_ORDER.indexOf(b.r.verdict)||String(a.p.name).localeCompare(String(b.p.name)));
  $('#list-count').textContent=S.prodReady?`${rows.length} / ${ev.length} 件`:'';
  const el=$('#stubs');
  if(!S.prodReady){el.innerHTML='<div class="empty">清單載入中…</div>';return}
  if(!ev.length){el.innerHTML='<div class="empty">清單還是空的。到「簡報」開一張委託單，請秘書查第一件。</div>';return}
  if(!rows.length){el.innerHTML='<div class="empty">這個篩選條件下沒有商品。</div>';return}
  el.innerHTML=rows.map(({p,r})=>`<button type="button" class="stub" data-act="open" data-id="${esc(p.id)}">
    <span class="ic">${ICON[p.category]||ICON.peripheral}</span>
    <span class="stub-main"><span class="stub-name">${esc(p.name)}</span><span class="stub-sub">${esc(p.kind||'')}${p.tagline?' · '+esc(p.tagline):''}</span>
      <span class="stub-row"><span class="stub-price">${money(r.now)}</span>${p.price&&p.price.nowBy==='auto'?'<span class="tag">自動</span>':''}${p.auto&&p.auto.status==='held'?'<span class="tag warn">待確認</span>':''}${spark(p)}<span class="stub-age${r.age!=null&&r.age>r.thr.freshDays?' old':''}">${ageText(p.checkedAt)}</span></span></span>
    ${stamp(r.verdict,'sm')}</button>`).join('');
}

/* ---------- detail ---------- */
function openDetail(id,opts){
  opts=opts||{};
  if(!S.products[id]){toast('找不到這件商品，可能還沒同步到。');return}
  audioUnlock();
  S.detail=id;S.whatIf={};S.lastVerdict=null;S.handoff=null;
  const sh=$('#sheet');sh.hidden=false;sh.scrollTop=0;document.body.style.overflow='hidden';
  $('#ask-in').value='';
  if(opts.push!==false){try{history.pushState({bc:'sheet',id},'','#p-'+id)}catch(e){}}
  renderDetail(true);
}
function closeDetail(){
  if(!S.detail)return;S.detail=null;$('#sheet').hidden=true;document.body.style.overflow='';
}
function requestClose(){
  if(history.state&&history.state.bc==='sheet'){history.back();return}
  closeDetail();try{history.replaceState(null,'',S.view==='brief'?location.pathname+location.search:'#'+S.view)}catch(e){}
}

function renderDetail(first){
  const p=S.products[S.detail];if(!p){closeDetail();return}
  const pr=prof();
  $('#sh-title').textContent=p.name;
  $('#sh-refresh').dataset.id=p.id;
  renderHandoff();renderVfd(p,first);renderVerdict(first);
  $('#wi-urg').innerHTML=segHTML(Object.entries(URG),S.whatIf.urgency||pr.urgency||'flexible','wi-urg');
  $('#wi-blabel').textContent=`這次的${(CATS[p.category]||{}).label||''}預算（NT$）`;
  const bi=$('#wi-budget');if(document.activeElement!==bi){const b='budget' in S.whatIf?S.whatIf.budget:pr.budget[p.category];bi.value=num(b)!=null?String(num(b)):''}
  renderSections(p,first);
  $('#ask-sugg').innerHTML=(SUGG[p.category]||SUGG.peripheral).map(q=>`<button type="button" class="chip" data-act="ask-sugg" data-q="${esc(q)}">${esc(q)}</button>`).join('');
  $('#sh-sources').innerHTML=sourcesHTML(p);
}
function renderHandoff(){
  const el=$('#sh-handoff');const h=S.handoff;
  if(!h||h.id!==S.detail){el.innerHTML='';return}
  const r=h.code&&S.reqs.find(x=>x.code===h.code);
  if(h.kind==='refresh'&&r){const st=reqStatus(r);
    el.innerHTML=st.done?`<div class="handoff"><p>秘書已經重查完成（${esc(ageText(st.p.checkedAt))}），下面就是最新的判定。</p></div>`
      :`<div class="handoff"><p><b>委託單 ${esc(r.code)} 已複製。</b>打開 Claude，貼到新對話送出；秘書查完後回到這裡下拉同步。</p><div class="tk-acts"><a class="btn" href="${CLAUDE_URL}" target="_blank" rel="noopener">開啟 Claude ↗</a><button type="button" class="btn" data-act="req-copy" data-code="${esc(r.code)}">再複製一次</button></div></div>`;
  }else if(h.kind==='ask'){
    el.innerHTML='';
  }else el.innerHTML='';
}
function countUp(el,target){
  if(reduceMotion()||target==null){return}
  const start=performance.now(),dur=620,from=Math.round(target*0.62);
  const step=now=>{if(!el.isConnected)return;const k=Math.min(1,(now-start)/dur);const e=1-Math.pow(1-k,3);
    el.textContent='NT$ '+Math.round(from+(target-from)*e).toLocaleString('en-US');if(k<1)requestAnimationFrame(step)};
  requestAnimationFrame(step);
}
function renderVfd(p,first){
  const P=p.price||{};const now=num(P.now);const low90=num(P.low90),ref=num(P.ref);const base=low90!=null?low90:ref;
  const delta=now!=null&&base!=null?pctTxt((now-base)/base*100):'--';
  const d=pd(p.checkedAt);const ds=d?`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`:'--/--';
  $('#sh-vfd').innerHTML=`<div class="vfd" role="img" aria-label="現價 ${money(now)}">
    <div class="vfd-row vfd-sm"><span>NOW ${ds}</span><span>${low90!=null?'vs LOW90':'vs REF'} ${delta}</span></div>
    <div class="vfd-row vfd-big"><span id="vfd-now">${now!=null?'NT$ '+Math.round(now).toLocaleString('en-US'):'NT$ ------'}</span></div>
    <div class="vfd-row vfd-sm"><span>REF ${ref!=null?Math.round(ref).toLocaleString('en-US'):'--'}</span><span>LOW90 ${low90!=null?Math.round(low90).toLocaleString('en-US'):'--'}</span></div>
  </div><p class="vfd-src">${P.nowSource?'現價來源：'+(P.nowUrl?link(P.nowUrl,P.nowSource):esc(P.nowSource)):'還沒有現價資料'}</p>${autoLineHTML(p)}`;
  if(first&&now!=null)countUp($('#vfd-now'),Math.round(now));
}
function renderVerdict(first){
  const p=S.products[S.detail];if(!p)return;const pr=prof();const r=evalP(p,S.whatIf,pr);
  const cat=CATS[p.category]||{label:'',code:'XX'};const chk=pd(p.checkedAt)||new Date();
  const roc=chk.getFullYear()-1911;const m=chk.getMonth()+1;const pm=m%2?m:m-1;
  const period=`${roc}年${String(pm).padStart(2,'0')}-${String(pm+1).padStart(2,'0')}月`;
  const no=`${cat.code}-${String(hash(p.id)%100000000).padStart(8,'0')}`;
  const evl=l=>Array.isArray(l.ev)&&l.ev.length?' '+l.ev.filter(x=>x&&safeUrl(x.url)).slice(0,2).map(x=>link(x.url,'['+(host(x.url)||'來源')+']')).join(' '):'';
  const [cl,cn]=CONF[r.conf];
  const changed=S.lastVerdict!==null&&S.lastVerdict!==r.verdict;
  const print=first&&!reduceMotion();
  const anim=first||changed?'stamping':'';
  S.lastVerdict=r.verdict;
  const chkTxt=`${chk.getFullYear()}-${String(chk.getMonth()+1).padStart(2,'0')}-${String(chk.getDate()).padStart(2,'0')} ${hm(chk)}`;
  $('#sh-receipt').innerHTML=`<article class="receipt paper zz-t zz-b${print?' printing':''}" aria-label="判定證明聯">
    <header class="rc-head"><span class="rc-title">判定證明聯</span><span class="rc-sub">${period}　No. ${no}</span><span class="rc-sub">查證 ${chkTxt}・判定即時計算</span></header>
    <hr class="rc-hr">
    <div><div class="rc-prod">${esc(p.name)}</div><div class="rc-tag">${esc(cat.label)}${p.kind?'・'+esc(p.kind):''}${p.tagline?'｜'+esc(p.tagline):''}</div></div>
    <hr class="rc-hr">
    <ol class="rls">${r.lines.map((l,i)=>`<li class="rl ${l.status}${l.status==='hit'?' v-'+l.effect:''}" style="--i:${i}"><span class="rl-id">${l.id}</span><span class="rl-q">${esc(l.q)}</span><span class="rl-dots"></span><span class="rl-res">${resTxt(l)}</span><span class="rl-d">${esc(l.detail)}${evl(l)}</span></li>`).join('')}</ol>
    <hr class="rc-hr">
    <div class="rc-total"><span class="lbl">判定</span>${stamp(r.verdict,'lg',anim)}</div>
    <p class="rc-concl">${esc(r.conclusion)}</p>
    <div class="rc-meta"><span class="conf">${cl} ${[1,2,3].map(i=>`<i class="${i<=cn?'on':''}"></i>`).join('')}</span><span>急迫度：${URG[r.urgency]}</span></div>
    <footer class="rc-foot">${barcode(p.id+r.verdict)}<span>不分潤・不導購・判定只看規則</span></footer>
  </article>`;
  if(anim)stampFx(print?880:300);
  const w=$('#sh-watch');if(w)w.innerHTML=watchHTML(r);
  const g=$('#sh-gains');if(g)g.innerHTML=gainsHTML(p,r,pr,false);
}
function watchHTML(r){return r.watch.length?`<ul class="watch">${r.watch.map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul>`:'<p class="small muted">目前沒有會讓判定改變的近期條件。</p>'}
function gainsHTML(p,r,pr,anim){
  const sel=new Set(pr.uses||[]);
  const irrelevant=USES.filter(([u])=>sel.has(u)&&lvOf((p.gain||{})[u],r.thr)==='na').map(([,l])=>l);
  const row=([u,label])=>{const g=(p.gain||{})[u]||{};const lv=lvOf(g,r.thr);const on=sel.has(u);if(lv==='na')return '';
    const pc=num(g.pct);const w=pc!=null?Math.min(100,Math.max(4,Math.abs(pc))):({big:72,some:38,none:6,worse:22}[lv]||0);
    return `<div class="g-row gc-${lv}${on?'':' off'}"><span class="g-lbl">${esc(label)}</span><span class="g-bar"><i style="width:${w}%"></i></span><span class="g-lv">${LV[lv]}${pc!=null?' '+pctTxt(pc):''}</span>${g.why?`<span class="g-why">${on?'':'（你沒勾選）'}${esc(g.why)}</span>`:on?'':'<span class="g-why">（你沒勾選）</span>'}</div>`};
  const rows=USES.filter(([u])=>sel.has(u)).map(row).join('')+USES.filter(([u])=>!sel.has(u)).map(row).join('');
  return `${p.gainBasis?`<p class="small muted">${esc(p.gainBasis)}</p>`:''}<div class="gains${anim?' anim':''}">${rows||'<p class="small muted">沒有升級資料。</p>'}</div>${irrelevant.length?`<p class="small muted">跟這件商品無關：${irrelevant.map(esc).join('、')}</p>`:''}`;
}
function card(title,eyebrow,body,id){return `<section class="card"${id?` id="${id}"`:''}><div class="card-h"><h3>${esc(title)}</h3>${eyebrow?`<span class="eyebrow">${eyebrow}</span>`:''}</div>${body}</section>`}
function renderSections(p,first){
  const pr=prof();const r=evalP(p,S.whatIf,pr);const P=p.price||{};
  const out=[];
  out.push(card('對你來說','FOR YOU',`<div id="sh-gains">${gainsHTML(p,r,pr,first&&!reduceMotion())}</div>`));
  out.push(card('什麼時候會改判','TRIGGERS',`<div id="sh-watch">${watchHTML(r)}</div>`));
  const rg=Array.isArray(P.range)&&P.range.length===2&&num(P.range[0])!=null&&num(P.range[1])!=null?`${Math.round(num(P.range[0])).toLocaleString('en-US')}–${Math.round(num(P.range[1])).toLocaleString('en-US')}`:'—';
  const tiles=[['現價',P.now,P.nowSource],[P.refLabel||'參考價',P.ref,''],['近 90 天低點',P.low90,P.low90Source],['通路價格區間（NT$）',null,rg]];
  out.push(card('價格','PRICE',`<div class="ptiles">${tiles.map(([l,v,s],i)=>`<div class="ptile"><span>${esc(l)}</span><b${i===3?' style="white-space:normal"':''}>${i===3?esc(s):money(v)}</b>${i<3&&s?`<small>${esc(s)}</small>`:''}</div>`).join('')}</div>
    <div class="row"><span class="trend ${esc(P.trend||'')}">${TREND[P.trend]||TREND.unknown}</span></div>${P.trendNote?`<p class="small">${esc(P.trendNote)}</p>`:''}
    ${P.trendSec&&P.trendSec.note?`<p class="small muted">秘書查證時的走勢：${esc(P.trendSec.note)}</p>`:''}
    ${priceChart(p)}${Array.isArray(P.trendSources)&&P.trendSources.length?`<p class="small muted">走勢依據：${P.trendSources.filter(x=>x&&safeUrl(x.url)).slice(0,3).map(x=>link(x.url,x.title)).join('、')}</p>`:''}
    ${autoCardHTML(p)}`));
  if(p.brief||(p.learn||[]).length)out.push(card('秘書補充','BRIEFING',`${p.brief?`<p class="brief">${esc(p.brief)}</p>`:''}${(p.learn||[]).length?`<div class="learn">${p.learn.map(t=>`<div><b>${esc(t.term)}</b><p>${esc(t.explain)}</p></div>`).join('')}</div>`:''}`));
  const s=p.successor;
  if(s&&s.name)out.push(card('下一代雷達','NEXT GEN',`<div class="succ"><span class="succ-name">${esc(s.name)}</span><div class="row"><span class="trend">${SUCC[s.status]||esc(s.status)}</span><span class="small mono">${esc(etaText(s.eta))}</span></div>${s.note?`<p class="small">${esc(s.note)}</p>`:''}${(s.sources||[]).length?`<p class="small muted">${s.sources.filter(x=>x&&safeUrl(x.url)).slice(0,4).map(x=>link(x.url,x.title)).join('・')}</p>`:''}</div>`));
  const iss=(p.issues||[]).filter(Boolean);
  out.push(card('已知問題','ISSUES',iss.length?`<ul class="list">${iss.map(i=>`<li><span><span class="sev ${i.status==='fixed'?'fixed':esc(i.severity)}">${i.status==='fixed'?'已修正':({high:'嚴重',medium:'中度',low:'輕微'}[i.severity]||'留意')}</span><b>${esc(i.title)}</b></span>${i.note?`<span class="small muted">${esc(i.note)}</span>`:''}${i.url?`<span class="src">${link(i.url)}</span>`:''}</li>`).join('')}</ul>`:'<p class="small muted">沒有查到已知問題。</p>'));
  if((p.specs||[]).length)out.push(card('規格白話','SPECS',`<dl class="specs">${p.specs.filter(x=>x&&x.k).map(x=>`<div><dt>${esc(x.k)}</dt><dd><b class="mono">${esc(x.v)}</b>${x.plain?`<span>${esc(x.plain)}</span>`:''}</dd></div>`).join('')}</dl>`));
  if((p.tests||[]).length)out.push(card('實測重點','TESTS',`<ul class="list">${p.tests.filter(Boolean).map(t=>`<li><span>${esc(t.claim)}</span><span class="src">${t.url?link(t.url,t.src||host(t.url)):esc(t.src||'')}</span></li>`).join('')}</ul>`));
  if((p.alternatives||[]).length)out.push(card('替代選項','ALTERNATIVES',`<div class="alts">${p.alternatives.filter(Boolean).map(a=>`<div class="alt"><b>${esc(a.name)}</b><span class="mono">${num(a.price)===0?'免費':money(a.price)}</span>${a.why?`<p>${esc(a.why)}</p>`:''}</div>`).join('')}</div>`));
  $('#sh-sections').innerHTML=out.join('');
}
function sourcesHTML(p){const src=(p.sources||[]).filter(x=>x&&safeUrl(x.url));
  const li=x=>`<li>${link(x.url,x.title||host(x.url))}<span>${esc(host(x.url))}${x.date?' · '+esc(x.date):''}</span></li>`;
  if(!src.length)return card('來源','SOURCES','<p class="small muted">沒有來源紀錄。</p>');
  const head=src.slice(0,8),rest=src.slice(8);
  return card('來源',`SOURCES · ${src.length}`,`<ul class="sources">${head.map(li).join('')}</ul>${rest.length?`<details class="more"><summary>其餘 ${rest.length} 筆來源</summary><ul class="sources">${rest.map(li).join('')}</ul></details>`:''}`)}

/* ---------- 問秘書：整理成一段話，貼到 Claude ---------- */
function askText(p,q){
  const pr=prof();const r=evalP(p,S.whatIf,pr);const P=p.price||{};const s=p.successor||{};
  const gains=USES.filter(([u])=>pr.uses.includes(u)).map(([u,l])=>{const x=(p.gain||{})[u]||{};const lv=lvOf(x,r.thr);
    return lv==='na'?null:`${l}${LV[lv]}${num(x.pct)!=null?`（${pctTxt(num(x.pct))}）`:''}${x.why?`：${x.why}`:''}`}).filter(Boolean);
  const sev={high:'嚴重',medium:'中度',low:'輕微'};
  const L=[
    '【下單前・問秘書】',
    `你是我的購買判定秘書。下面是我的《下單前》App 對「${p.name}」的判定和查證資料（查證於 ${mdhm(p.checkedAt)}）。請先根據這些資料回答我的問題：台灣繁體中文、白話、具體帶數字，像資深秘書跟老闆口頭簡報，250 字以內。資料不夠或可能過時的地方可以上網查最新資訊，但要講明哪些是新查到的。判定是 App 的規則算的，不要自己改判定，也不要推銷或給購物連結。`,
    '',
    `【我的問題】${q}`,
    '',
    `【我】筆電：${pr.gear.laptop||'未填'}；手機：${(pr.gear.phones||[]).join('、')||'未填'}；桌機：${DESK[pr.desktopStatus]||'未填'}；用途：${pr.uses.map(u=>USE_LABEL[u]).join('、')}；急迫度：${URG[r.urgency]}${r.budget!=null?`；這類預算 ${money(r.budget)}`:''}${pr.notes?`；備註：${pr.notes}`:''}`,
    `【判定】${V[r.verdict].label}｜${r.conclusion}`,
    '【規則逐條】',
    ...r.lines.map(l=>`・${l.id} ${l.q}：${resTxt(l).replace('● ','觸發→')}｜${l.detail}`),
    r.watch.length?`【會改判的條件】${r.watch.join('；')}`:'',
    `【價格】現價 ${money(P.now)}（${P.nowSource||'來源不明'}）；${P.refLabel||'參考價'} ${money(P.ref)}；近 90 天低點 ${money(P.low90)}；${TREND[P.trend]||TREND.unknown}${P.trendNote?`：${P.trendNote}`:''}`,
    `【對我的升級】${gains.join('；')||'沒有相關用途'}${p.gainBasis?`（${p.gainBasis}）`:''}`,
    s.name?`【下一代】${s.name}：${SUCC[s.status]||s.status}，${etaText(s.eta)}${s.note?`。${s.note}`:''}`:'【下一代】目前沒有消息',
    `【已知問題】${(p.issues||[]).length?p.issues.map(i=>`${i.title}（${i.status==='fixed'?'已修正':sev[i.severity]||'留意'}）`).join('；'):'沒有'}`,
    (p.tests||[]).length?`【實測】${p.tests.slice(0,4).map(t=>t.claim+(t.src?`（${t.src}）`:'')).join('；')}`:'',
    (p.alternatives||[]).length?`【替代選項】${p.alternatives.map(a=>`${a.name}（${num(a.price)===0?'免費':money(a.price)}）${a.why?`：${a.why}`:''}`).join('；')}`:'',
    p.brief?`【秘書補充】${p.brief}`:''
  ];
  return L.filter(x=>x!=='').join('\n').replace(/\n【我的問題】/,'\n\n【我的問題】');
}

/* ---------- rules & me ---------- */
function thrPreview(t){const pr={...prof(),thr:t};const c={buy:0,wait:0,next:0,skip:0};Object.values(S.products).forEach(p=>c[evalP(p,{},pr).verdict]++);return c}
function renderThr(){
  const t=S.thrDraft||prof().thr;const f=$('#f-thr');
  const cur=thrPreview(prof().thr),nx=thrPreview(t);
  f.innerHTML=THR_META.map(m=>`<div class="thr-row"><label for="thr-${m.k}"><span>${m.label}</span><output id="out-${m.k}">${t[m.k]}${m.unit}</output></label>
    <input type="range" id="thr-${m.k}" data-k="${m.k}" min="${m.min}" max="${m.max}" step="${m.step}" value="${t[m.k]}"><p>${m.desc}</p></div>`).join('')+
    `<p class="preview" id="thr-prev">${previewTxt(cur,nx)}</p><div class="row"><button class="btn btn-seal" type="submit">儲存門檻</button><button class="btn" type="button" data-act="thr-reset">恢復預設</button></div>`;
  $('#rulebook').innerHTML=RULES.map(([id,q,eff,d])=>`<div><dt>${id}</dt><dd><b>${q}</b>${eff?`<span>觸發 → ${V[eff].label}</span>`:'<span>只影響證據強度</span>'}<span>${d}</span></dd></div>`).join('');
}
function previewTxt(a,b){const same=V_ORDER.every(v=>a[v]===b[v]);const s=V_ORDER.map(v=>`${V[v].label} ${b[v]}${a[v]!==b[v]?`（原 ${a[v]}）`:''}`).join('・');return (same?'套用後判定不變：':'套用後：')+s}

function renderMe(){
  const pr=prof();const f=$('#f-me');
  $('#me-banner').innerHTML=repoNewer()?`<div class="notice"><span><b>秘書更新了你的雲端預設（${esc(mdhm(S.repoProfile.updatedAt))}）。</b>這台裝置上有你自己改過的設定，要換成雲端的新版本嗎？預算會保留。</span>
    <div class="row"><button type="button" class="btn btn-seal" data-act="me-apply-cloud">套用雲端預設</button><button type="button" class="btn" data-act="me-keep">保留現在的</button></div></div>`:'';
  f.innerHTML=`
  <section class="card"><div class="card-h"><h2>我的裝備</h2><span class="eyebrow">GEAR</span></div>
    <p class="small muted">升級幅度都拿這些來比。秘書先依你提過的資訊填好了，請確認或修改。</p>
    <label class="field"><span>稱呼</span><input class="input" id="me-name" maxlength="20" value="${esc(pr.name)}" placeholder="秘書怎麼稱呼你"></label>
    <label class="field"><span>筆電</span><textarea class="input" id="me-laptop" rows="2" maxlength="200">${esc(pr.gear.laptop)}</textarea></label>
    <label class="field"><span>手機（用頓號或逗號分開）</span><input class="input" id="me-phones" maxlength="200" value="${esc((pr.gear.phones||[]).join('、'))}"></label>
    <div class="field"><span>桌機</span><div class="seg" id="me-desk" role="radiogroup" aria-label="桌機狀態">${segHTML(Object.entries(DESK),pr.desktopStatus,'me-desk')}</div></div>
    <label class="field"><span>其他裝備與習慣</span><textarea class="input" id="me-notes" rows="3" maxlength="400" placeholder="例如：常玩的遊戲、直播設備、想做的事">${esc(pr.notes||pr.gear.others||'')}</textarea></label>
  </section>
  <section class="card"><div class="card-h"><h2>用途</h2><span class="eyebrow">USES</span></div>
    <p class="small muted">只有勾選的用途會算進「有沒有感」。</p>
    <div class="chips" id="me-uses">${USES.map(([u,l])=>`<button type="button" class="chip" aria-pressed="${pr.uses.includes(u)}" data-act="me-use" data-val="${u}">${l}</button>`).join('')}</div>
  </section>
  <section class="card"><div class="card-h"><h2>預算</h2><span class="eyebrow">BUDGET · NT$</span></div>
    <p class="small muted">留白就是不設上限。超過預算會判「不用買」。預算只存在這台裝置，不會上傳。</p>
    <div class="grid2">${Object.entries(CATS).map(([c,v])=>`<label class="field"><span>${v.label}</span><input class="input mono" id="me-b-${c}" type="number" inputmode="numeric" min="0" step="500" value="${num(pr.budget[c])!=null?num(pr.budget[c]):''}" placeholder="不設"></label>`).join('')}</div>
  </section>
  <section class="card"><div class="card-h"><h2>急迫度</h2><span class="eyebrow">URGENCY</span></div>
    <p class="small muted">「現在就要」時，價格偏高和大促只提醒、不擋，新一代只看官方一個月內。</p>
    <div class="seg" id="me-urg" role="radiogroup" aria-label="急迫度">${segHTML(Object.entries(URG),pr.urgency,'me-urg')}</div>
  </section>
  <div class="row"><button class="btn btn-seal" type="submit">儲存設定</button><span class="small muted" id="me-saved"></span></div>`;
  f.dataset.desk=pr.desktopStatus;f.dataset.urg=pr.urgency;
  renderMeExtra();
}
function renderMeExtra(){
  const n=Object.keys(S.products).length;
  $('#me-extra').innerHTML=`
  <section class="card"><div class="card-h"><h2>設定存在哪</h2><span class="eyebrow">SYNC</span></div>
    <p class="small muted">你在這裡改的設定只存在這台裝置。雲端預設是秘書替你建好的那一份，所有裝置共用；想讓 iPhone、ROG Phone、筆電都一樣，就把設定交給秘書寫回雲端。</p>
    <div class="row"><button type="button" class="btn" data-act="me-to-cloud">複製給秘書：寫回雲端</button>${hasLocalOverrides()?'<button type="button" class="btn" data-act="me-reset">改回雲端預設</button>':''}</div>
  </section>
  <section class="card"><div class="card-h"><h2>音效與震動</h2><span class="eyebrow">FEEL</span></div>
    <div class="switch"><span><b>蓋章震動</b><span>判定蓋章時震一下（Android 手機）</span></span><button type="button" class="sw" role="switch" aria-checked="${!!S.prefs.haptics}" data-act="pref" data-k="haptics" aria-label="蓋章震動"></button></div>
    <div class="switch"><span><b>蓋章音效</b><span>判定蓋章時「咚」一聲</span></span><button type="button" class="sw" role="switch" aria-checked="${!!S.prefs.sound}" data-act="pref" data-k="sound" aria-label="蓋章音效"></button></div>
  </section>
  <section class="card"><div class="card-h"><h2>關於這個 App</h2><span class="eyebrow">ABOUT</span></div>
    <dl class="kv"><dt>最新查證</dt><dd>${esc(S.dataAt?mdhm(S.dataAt):'—')}</dd><dt>App 更新</dt><dd>${esc(S.builtAt?mdhm(S.builtAt):'—')}</dd><dt>商品</dt><dd>${n} 件</dd>
      <dt>自動追價</dt><dd>${esc(trackerText())}</dd><dt>同步</dt><dd>${esc(S.syncedAt?'今天 '+hm(S.syncedAt):S.sync==='offline'?'離線':'—')}</dd><dt>原始碼</dt><dd>${link(REPO_URL,REPO)}</dd></dl>
    <p class="small muted">不分潤、不導購。判定由固定規則計算，秘書只查事實。</p>
  </section>`;
}
function trackerText(){
  const last=S.tracker&&S.tracker.lastRun;if(!last)return '還沒執行';
  const src=Object.entries(last.sources||{}).map(([k,v])=>`${k==='pchome'?'PChome':k==='coolpc'?'原價屋':k}${v==='ok'?'正常':'失敗'}`).join('、');
  return `${mdhm(last.at)}${src?`（${src}）`:''}，下一次 ${nextRunText()}`;
}
function profileForCloud(){const pr=prof();return {name:pr.name,gear:pr.gear,desktopStatus:pr.desktopStatus,uses:pr.uses,urgency:pr.urgency,thr:pr.thr,notes:pr.notes}}
function cloudText(){
  return `【下單前・更新雲端預設】\n請把我的《下單前》App（GitHub：${REPO}）的 data/profile.json 改成下面這份設定，updatedAt 填現在的台灣時間，照 SECRETARY.md 驗證後推上 main。預算只存在我的手機，不要寫進去。\n${JSON.stringify(profileForCloud(),null,2)}`;
}

/* ---------- sync ---------- */
function applyBundle(b,fromCache){
  const m={};for(const p of b.products||[])if(p&&p.id&&p.name)m[p.id]=p;
  S.products=m;S.calendar=(b.calendar&&Array.isArray(b.calendar.events))?b.calendar.events:[];
  S.repoProfile=b.profile||null;S.builtAt=b.builtAt||null;S.dataAt=b.dataAt||b.builtAt||null;S.buildId=b.buildId||null;S.prodReady=true;S.fromCache=!!fromCache;
  S.tracker=b.tracker||null;
}
async function sync(manual){
  if(S.sync==='syncing')return;
  S.sync='syncing';S.lastTry=Date.now();renderSync();
  const ctl=typeof AbortController!=='undefined'?new AbortController():null;const to=setTimeout(()=>ctl&&ctl.abort(),15000);
  try{
    const res=await fetch('data/bundle.json?t='+Date.now(),{cache:'no-store',signal:ctl?ctl.signal:undefined});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const b=await res.json();if(!b||!Array.isArray(b.products))throw new Error('bad bundle');
    if(res.headers.get('X-BC-Offline')==='1'){
      // service worker 給的是離線存檔：照樣顯示，但不能說成「已同步」
      if(!S.prodReady||b.buildId!==S.buildId)applyBundle(b,true);
      S.sync='offline';
      if(manual)toast('連不上，先顯示上次存的資料');
      return;
    }
    const changed=b.buildId!==S.buildId;const had=S.prodReady;
    applyBundle(b,false);store.set(LS.bundle,b);
    S.sync='ok';S.syncedAt=Date.now();
    checkRequests();
    if(manual)toast(changed&&had?`已更新到 ${mdhm(b.builtAt)} 的資料`:'已經是最新資料');
    else if(changed&&had)toast('資料已更新');
  }catch(e){
    S.sync=S.prodReady?'offline':'error';
    if(manual)toast(S.prodReady?'連不上，先顯示上次存的資料':'連不上，稍後再試');
  }finally{clearTimeout(to);renderAll()}
}

/* ---------- pull to refresh ---------- */
const PTR={on:false,y0:0,pull:0,busy:false};
function ptrSet(h,state){const el=$('#ptr');el.style.setProperty('--h',Math.round(h)+'px');el.dataset.state=state||'';
  const t=$('#ptr-t'),s=$('#ptr-s');
  if(state==='ready'){t.textContent='放開同步';s.textContent='RELEASE TO SYNC'}
  else if(state==='sync'){t.textContent='同步中…';s.textContent='SYNCING'}
  else{t.textContent='下拉同步';s.textContent='PULL TO SYNC'}}
function initPTR(){
  const TH=72;
  window.addEventListener('touchstart',e=>{
    if(S.detail||PTR.busy||e.touches.length!==1||window.scrollY>2)return;
    if(e.target.closest&&e.target.closest('input,textarea,select,.seg,[role="slider"]'))return;
    PTR.on=true;PTR.y0=e.touches[0].clientY;PTR.pull=0;$('#ptr').classList.add('drag');
  },{passive:true});
  window.addEventListener('touchmove',e=>{
    if(!PTR.on)return;const dy=e.touches[0].clientY-PTR.y0;
    if(dy<=0||window.scrollY>2){PTR.pull=0;ptrSet(0);return}
    PTR.pull=Math.min(118,dy*.55);ptrSet(PTR.pull,PTR.pull>=TH?'ready':'pull');
  },{passive:true});
  const end=()=>{
    if(!PTR.on)return;PTR.on=false;$('#ptr').classList.remove('drag');
    if(PTR.pull>=TH){PTR.busy=true;ptrSet(58,'sync');buzz(10);
      sync(true).finally(()=>{setTimeout(()=>{ptrSet(0);PTR.busy=false},250)})}
    else ptrSet(0);
    PTR.pull=0;
  };
  window.addEventListener('touchend',end,{passive:true});window.addEventListener('touchcancel',end,{passive:true});
}
function measureTopbar(){const h=$('#topbar').getBoundingClientRect().height;if(h)document.documentElement.style.setProperty('--tb',h+'px')}

/* ---------- render all ---------- */
function renderAll(){
  renderSync();
  if(S.view==='brief')renderBrief();
  if(S.view==='list')renderList();
  if(S.view==='rules'&&!S.thrDirty)renderThr();
  if(S.view==='me'){if(!S.meDirty&&!$('#f-me').contains(document.activeElement))renderMe();else renderMeExtra()}
  if(S.detail)renderDetail(false);
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-act]');if(!t)return;const a=t.dataset.act,val=t.dataset.val;
  if(a==='tab'){if(S.detail)requestClose();setView(t.dataset.view)}
  else if(a==='sync')sync(true);
  else if(a==='board')nextBoard();
  else if(a==='tally'){S.fv=val;S.fcat='all';setView('list')}
  else if(a==='fcat'){S.fcat=val;renderList()}
  else if(a==='fv'){S.fv=S.fv===val?'all':val;renderList()}
  else if(a==='open')openDetail(t.dataset.id);
  else if(a==='close')requestClose();
  else if(a==='dcat'){S.dcat=val;renderDispatchSeg()}
  else if(a==='refresh'){const p=S.products[t.dataset.id||S.detail];if(!p)return;
    const r=addRequest({q:p.name,category:p.category,productId:p.id});if(S.detail===p.id)S.handoff={id:p.id,kind:'refresh',code:r.code};
    handoff(r).then(()=>{if(S.detail)$('#sheet').scrollTo({top:0,behavior:reduceMotion()?'auto':'smooth'})});renderTickets()}
  else if(a==='req-copy'){const r=S.reqs.find(x=>x.code===t.dataset.code);if(r)handoff(r)}
  else if(a==='del-req'){S.reqs=S.reqs.filter(x=>x.code!==t.dataset.code);saveReqs();renderTickets();if(S.view==='brief')renderAttention(allEvals())}
  else if(a==='wi-urg'){S.whatIf.urgency=val;$('#wi-urg').innerHTML=segHTML(Object.entries(URG),val,'wi-urg');renderVerdict(false)}
  else if(a==='save-wi'){const p=S.products[S.detail];if(!p)return;const pr=prof();const patch={};
    if(S.whatIf.urgency)patch.urgency=S.whatIf.urgency;if('budget' in S.whatIf)patch.budget={...pr.budget,[p.category]:S.whatIf.budget};
    if(!Object.keys(patch).length){toast('你還沒改任何條件。');return}
    saveLocal(patch,'已存成你的設定');S.whatIf={};renderDetail(false)}
  else if(a==='ask-sugg'){const i=$('#ask-in');i.value=t.dataset.q||'';i.focus()}
  else if(a==='me-desk'){const f=$('#f-me');f.dataset.desk=val;$('#me-desk').innerHTML=segHTML(Object.entries(DESK),val,'me-desk');S.meDirty=true}
  else if(a==='me-urg'){const f=$('#f-me');f.dataset.urg=val;$('#me-urg').innerHTML=segHTML(Object.entries(URG),val,'me-urg');S.meDirty=true}
  else if(a==='me-use'){const on=t.getAttribute('aria-pressed')!=='true';t.setAttribute('aria-pressed',String(on));S.meDirty=true}
  else if(a==='me-apply-cloud'){resetToCloud()}
  else if(a==='me-keep'){keepLocal();toast('保留這台裝置的設定')}
  else if(a==='me-reset'){resetToCloud()}
  else if(a==='me-to-cloud'){copyOrFallback(cloudText(),'把設定交給秘書','已複製，貼到 Claude 對話送出，秘書會寫回雲端')}
  else if(a==='copyfb-close'){const el=$('#copyfb');if(el)el.hidden=true}
  else if(a==='pref'){const k=t.dataset.k;S.prefs[k]=!S.prefs[k];store.set(LS.prefs,S.prefs);t.setAttribute('aria-checked',String(S.prefs[k]));
    if(k==='sound'&&S.prefs.sound){audioUnlock();thump()}if(k==='haptics'&&S.prefs.haptics)buzz(16)}
  else if(a==='thr-reset'){S.thrDraft={...DEFAULT_THR};S.thrDirty=true;renderThr()}
  else if(a==='install'){const ev=S.installEvt;if(!ev)return;ev.prompt();(ev.userChoice||Promise.resolve()).then(()=>{S.installEvt=null;renderInstall()})}
  else if(a==='hide-install'){store.set(LS.install,true);renderInstall()}
});

$('#f-dispatch').addEventListener('submit',e=>{e.preventDefault();const q=$('#d-q').value.trim();if(!q){toast('先輸入想查的商品。');$('#d-q').focus();return}
  const note=$('#d-note').value.trim();const r=addRequest({q,category:S.dcat==='auto'?'auto':S.dcat,note});
  $('#d-q').value='';$('#d-note').value='';renderTickets();handoff(r)});
$('#f-ask').addEventListener('submit',e=>{e.preventDefault();const p=S.products[S.detail];if(!p)return;const q=$('#ask-in').value.trim();
  if(!q){toast('先寫下你的問題，或點上面的建議問題。');$('#ask-in').focus();return}
  copyOrFallback(askText(p,q),'問秘書','問題和判定單已複製，打開 Claude 貼上送出')});
$('#wi-budget').addEventListener('input',e=>{const v=e.target.value.trim();S.whatIf.budget=v===''?null:num(v);renderVerdict(false)});
$('#f-thr').addEventListener('input',e=>{const el=e.target;if(!el.dataset||!el.dataset.k)return;const m=THR_META.find(x=>x.k===el.dataset.k);
  S.thrDraft={...(S.thrDraft||prof().thr),[m.k]:Number(el.value)};S.thrDirty=true;$('#out-'+m.k).textContent=el.value+m.unit;$('#thr-prev').textContent=previewTxt(thrPreview(prof().thr),thrPreview(S.thrDraft))});
$('#f-thr').addEventListener('submit',e=>{e.preventDefault();const t={...(S.thrDraft||prof().thr)};if(t.smallGain>=t.bigGain){toast('小升級門檻要比大升級門檻低。');return}
  saveLocal({thr:t},'門檻已儲存，判定已重算');S.thrDraft=null;S.thrDirty=false;renderThr()});
$('#f-me').addEventListener('input',()=>{S.meDirty=true});
$('#f-me').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget;const pr=prof();
  const uses=[...f.querySelectorAll('[data-act="me-use"]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.val);
  const budget={};for(const c of Object.keys(CATS)){const v=$('#me-b-'+c).value.trim();budget[c]=v===''?null:num(v)}
  const phones=$('#me-phones').value.split(/[、,，\n]/).map(s=>s.trim()).filter(Boolean);
  saveLocal({name:$('#me-name').value.trim(),gear:{...pr.gear,laptop:$('#me-laptop').value.trim(),phones},notes:$('#me-notes').value.trim(),
    desktopStatus:f.dataset.desk||'none',urgency:f.dataset.urg||'flexible',uses,budget},'設定已儲存，判定已重算');
  S.meDirty=false;renderMe();$('#me-saved').textContent='已儲存 '+hm(Date.now())});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.detail)requestClose()});
window.addEventListener('popstate',e=>{
  const st=e.state;
  if(st&&st.bc==='sheet'){if(S.products[st.id]&&S.detail!==st.id)openDetail(st.id,{push:false});return}
  if(S.detail)closeDetail();
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(Date.now()-S.lastTry>90000)sync(false);else if(S.view==='brief'&&!S.detail)renderBrief()}});
window.addEventListener('online',()=>sync(false));
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();S.installEvt=e;renderInstall()});
window.addEventListener('appinstalled',()=>{S.installEvt=null;store.set(LS.install,true);renderInstall()});
window.addEventListener('resize',measureTopbar);

/* ---------- boot ---------- */
function openFromHash(){
  const h=decodeURIComponent((location.hash||'').slice(1));
  if(h.startsWith('p-')&&S.products[h.slice(2)]){
    try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
    openDetail(h.slice(2));return true}
  if(VIEWS.includes(h)&&h!=='brief'){setView(h,{keepHash:true});return true}
  return false;
}
let hashDone=false;
function boot(){
  measureTopbar();renderDispatchSeg();
  const cached=store.get(LS.bundle,null);
  if(cached&&Array.isArray(cached.products))applyBundle(cached,true);
  renderAll();
  if(S.prodReady){hashDone=true;openFromHash()}
  sync(false).then(()=>{if(!hashDone&&S.prodReady){hashDone=true;openFromHash()}});
  initPTR();
  setInterval(()=>{if(document.visibilityState!=='visible'||S.detail)return;if(S.view==='brief'){nextBoard();$('#memo-date').textContent=(()=>{const d=new Date();return `${d.getMonth()+1}/${d.getDate()}（${WD[d.getDay()]}）${hm(d)}`})()}},5000);
  if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}
boot();
})();
