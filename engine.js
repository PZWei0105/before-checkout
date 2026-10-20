/* 下單前 判定引擎
 * App（瀏覽器）和 tools/build.mjs（Node）共用這一份。
 * 規則依序檢查：不用買 → 等新一代 → 再等等；都沒觸發就是現在買。
 * 改規則時，跑 `node tools/build.mjs --check` 看判定表有沒有變。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BCEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------- constants ---------- */
const USES=[['gaming','PC 遊戲'],['mobileGaming','手遊'],['localAI','本機 AI'],['editing','剪片'],['streaming','直播'],['photo','拍照錄影'],['daily','日常']];
const USE_LABEL=Object.fromEntries(USES);
const CATS={gpu:{label:'顯卡',code:'GP'},phone:{label:'手機',code:'PH'},peripheral:{label:'周邊',code:'PE'}};
const V={buy:{label:'現在買',en:'BUY NOW'},wait:{label:'再等等',en:'HOLD'},next:{label:'等新一代',en:'NEXT GEN'},skip:{label:'不用買',en:'SKIP'}};
const V_ORDER=['buy','wait','next','skip'];
const LV={big:'大升級',some:'小升級',none:'無感',worse:'退步',na:'不相關'};
const LV_RANK={big:3,some:2,none:1,worse:0,na:-1};
const URG={flexible:'不急',month:'一個月內',now:'現在就要'};
const DESK={none:'沒有桌機',planning:'打算組桌機',have:'已有桌機'};
const SUCC={official:'官方已發表',credible:'可信消息',rumor:'傳聞',none:'無消息'};
const TREND={up:'價格上漲中',flat:'價格持平',down:'價格下滑中',unknown:'走勢不明'};
const STATUS={'on-sale':'已開賣',preorder:'預購中',announced:'已發表、未開賣',discontinued:'已停產',rumored:'尚未發表'};
const DEFAULT_THR={pricePremium:8,saleDays:30,successorMonths:4,bigGain:30,smallGain:10,freshDays:7};
const DEFAULT_PROFILE={name:'',gear:{laptop:'',phones:[],others:''},desktopStatus:'none',uses:['gaming','daily'],budget:{gpu:null,phone:null,peripheral:null},urgency:'flexible',thr:{...DEFAULT_THR},notes:''};
const THR_META=[
  {k:'pricePremium',label:'價差門檻',unit:'%',min:3,max:30,step:1,desc:'現價比參考價（有近 90 天低點就用它，沒有就用建議售價）高出這麼多，判「再等等」。'},
  {k:'saleDays',label:'大促窗口',unit:' 天',min:7,max:60,step:1,desc:'這幾天內有這類商品的大型促銷，判「再等等」。'},
  {k:'successorMonths',label:'新一代窗口',unit:' 個月',min:1,max:12,step:1,desc:'官方或可信消息指出新一代在這段時間內上市，判「等新一代」。'},
  {k:'bigGain',label:'大升級門檻',unit:'%',min:15,max:100,step:5,desc:'比你現有裝備強這麼多，才算「大升級」。'},
  {k:'smallGain',label:'小升級門檻',unit:'%',min:5,max:30,step:1,desc:'升級幅度低於這個，算「無感」。'},
  {k:'freshDays',label:'資料保鮮期',unit:' 天',min:1,max:30,step:1,desc:'超過這麼久沒查證，提醒你請秘書重查。'}
];
const RULES=[
  ['N1','對你的用途有感嗎','skip','看你勾選的每個用途，它比你現有裝備強多少。全部「無感」或「退步」，判不用買。'],
  ['N2','你能直接用嗎','skip','需要桌機才裝得上的零件（例如桌機顯示卡），你沒有桌機就判不用買。'],
  ['B1','在預算內嗎','skip','現價超過你在「我」設定的類別預算，判不用買。沒設預算就跳過。'],
  ['G1','新一代快來了嗎','next','官方發表或可信消息指出新一代在窗口內上市，判等新一代。傳聞只列出、不判定。'],
  ['S1','開賣了嗎','wait','只發表還沒開賣，判再等等，等上市價和實測。'],
  ['D1','有重大瑕疵嗎','wait','有尚未解決的高嚴重度問題（召回、燒毀、普遍故障），判再等等。'],
  ['P1','價格偏高嗎','wait','現價比參考價高出門檻，判再等等。設定「現在就要」時只提醒。'],
  ['P2','大促快到了嗎','wait','窗口內有這類商品的大型促銷，判再等等。價格正在上漲時改成提醒，避免等折扣反而買更貴。'],
  ['T1','價格往哪走','wait','價格明顯下滑時判再等等；上漲時只提醒越等越貴。'],
  ['F1','資料夠新嗎',null,'不影響判定，只影響證據強度，超過保鮮期會提醒重查。']
];

/* ---------- helpers ---------- */
let FIXED_TODAY=null;
function setToday(d){FIXED_TODAY=d==null?null:new Date(d)}
function today(){return FIXED_TODAY?new Date(FIXED_TODAY):new Date()}
const num=x=>{if(x==null)return null;if(typeof x==='string'){const s=x.replace(/[^\d.\-]/g,'');if(!s)return null;x=Number(s)}return typeof x==='number'&&isFinite(x)?x:null};
const money=n=>{n=num(n);return n==null?'—':'NT$ '+Math.round(n).toLocaleString('en-US')};
const pctTxt=n=>(n>0?'+':'')+(Math.round(n*10)/10)+'%';
const DAY=864e5;
function sod(d){const x=new Date(d);x.setHours(0,0,0,0);return x}
function pd(s){if(s==null||s==='')return null;if(typeof s==='number')return new Date(s);const t=String(s);
  if(/T\d/.test(t)){const d=new Date(t);return isNaN(d)?null:d}
  const m=t.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);if(m)return new Date(+m[1],+m[2]-1,m[3]?+m[3]:15);
  const d=new Date(t);return isNaN(d)?null:d}
function daysUntil(s){const d=pd(s);return d?Math.round((sod(d)-sod(today()))/DAY):null}
function monthsUntil(s){const n=daysUntil(s);return n==null?null:n/30.44}
function daysSince(s){const d=pd(s);return d?Math.max(0,Math.round((sod(today())-sod(d))/DAY)):null}
function etaText(s){if(!s)return '時間未定';const m=String(s).match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);if(!m)return String(s);return m[3]?`${m[1]}/${+m[2]}/${+m[3]}`:`${m[1]} 年 ${+m[2]} 月`}
function ageText(s){const a=daysSince(s);if(a==null)return '未查證';if(a===0)return '今天查證';if(a===1)return '昨天查證';return a+' 天前查證'}
const tail=s=>/[A-Za-z0-9)）]$/.test(String(s))?s+' ':String(s);
const head=s=>/^[A-Za-z0-9(（]/.test(String(s))?' '+s:String(s);

function normProfile(p){p=p||{};return {...DEFAULT_PROFILE,...p,
  gear:{...DEFAULT_PROFILE.gear,...(p.gear||{})},budget:{...DEFAULT_PROFILE.budget,...(p.budget||{})},
  thr:{...DEFAULT_THR,...(p.thr||{})},uses:Array.isArray(p.uses)?p.uses.filter(u=>USE_LABEL[u]):DEFAULT_PROFILE.uses.slice()}}

/* ---------- rule engine ---------- */
function lvOf(g,thr){if(!g||g.level==='na')return 'na';const p=num(g.pct);
  if(p!=null){if(p<=-thr.smallGain)return 'worse';if(p>=thr.bigGain)return 'big';if(p>=thr.smallGain)return 'some';return g.level==='worse'?'worse':'none'}
  return LV[g.level]?g.level:'na'}
function eventsFor(calendar,cat,days){return (calendar||[]).filter(e=>e&&(e.type||'sale')==='sale'&&Array.isArray(e.categories)&&e.categories.includes(cat))
  .map(e=>({...e,d:daysUntil(e.date)})).filter(e=>e.d!=null&&e.d>=0&&e.d<=days).sort((a,b)=>a.d-b.d)}

function evaluate(p,pr,over,ctx){
  over=over||{};ctx=ctx||{};
  const thr={...DEFAULT_THR,...(pr.thr||{})};
  const urgency=over.urgency||pr.urgency||'flexible';
  const cat=p.category;
  const budget=num('budget' in over?over.budget:(pr.budget||{})[cat]);
  const P=p.price||{};const now=num(P.now);
  const L=[];const add=o=>{L.push(o);return o};

  // N1 用途
  const uses=(pr.uses||[]).filter(u=>USE_LABEL[u]);
  const rel=uses.map(u=>({u,g:(p.gain||{})[u]||null,lv:lvOf((p.gain||{})[u],thr)}));
  const relevant=rel.filter(x=>x.lv!=='na');
  const ups=relevant.filter(x=>x.lv==='big'||x.lv==='some').sort((a,b)=>(LV_RANK[b.lv]-LV_RANK[a.lv])||((num(b.g&&b.g.pct)||0)-(num(a.g&&a.g.pct)||0)));
  const best=ups[0]||null;
  const gtxt=x=>USE_LABEL[x.u]+LV[x.lv]+(num(x.g&&x.g.pct)!=null?`（${pctTxt(num(x.g.pct))}）`:'');
  if(!uses.length)add({id:'N1',q:'對你的用途有感嗎',effect:'skip',status:'na',detail:'還沒勾選用途，到「我」設定後才判斷。'});
  else if(!relevant.length)add({id:'N1',q:'對你的用途有感嗎',effect:'skip',status:'hit',detail:`跟你勾選的用途（${uses.map(u=>USE_LABEL[u]).join('、')}）都不相關。`});
  else if(!best)add({id:'N1',q:'對你的用途有感嗎',effect:'skip',status:'hit',detail:'沒有一項明顯升級：'+relevant.map(gtxt).join('、')+'。'});
  else add({id:'N1',q:'對你的用途有感嗎',effect:'skip',status:'pass',detail:'有感：'+ups.slice(0,2).map(gtxt).join('、')+'。'});

  // N2 平台
  const needs=p.needs||{};
  if(needs.desktop){const ds=pr.desktopStatus||'none';
    if(ds==='none')add({id:'N2',q:'你能直接用嗎',effect:'skip',status:'hit',detail:'這是桌機零件，你目前沒有桌機，單買裝不起來。'+(needs.note?needs.note:'')});
    else add({id:'N2',q:'你能直接用嗎',effect:'skip',status:'pass',detail:(ds==='planning'?'你打算組桌機：記得另計主機板、電源、機殼的整機成本。':'你有桌機，可以直接裝。')+(needs.note?' '+needs.note:'')});
  }else add({id:'N2',q:'你能直接用嗎',effect:'skip',status:'pass',detail:needs.note?String(needs.note):'不需要額外平台。'});

  // B1 預算
  const clabel=(CATS[cat]||{}).label||'';
  if(budget==null)add({id:'B1',q:'在預算內嗎',effect:'skip',status:'na',detail:`還沒設定${clabel}預算，這條先跳過。`});
  else if(now==null)add({id:'B1',q:'在預算內嗎',effect:'skip',status:'na',detail:'沒有現價資料，無法比對預算。'});
  else if(now>budget)add({id:'B1',q:'在預算內嗎',effect:'skip',status:'hit',detail:`現價 ${money(now)}，比你的${clabel}預算 ${money(budget)} 多 ${money(now-budget)}。`});
  else add({id:'B1',q:'在預算內嗎',effect:'skip',status:'pass',detail:`在預算內，還剩 ${money(budget-now)}。`});

  // G1 新一代
  const s=p.successor||{};const mo=monthsUntil(s.eta);
  if(!s.name||s.status==='none'||!s.status)add({id:'G1',q:'新一代快來了嗎',effect:'next',status:'pass',detail:'目前沒有新一代的消息。'});
  else{const win=urgency==='now'?1:thr.successorMonths;const ok=urgency==='now'?s.status==='official':(s.status==='official'||s.status==='credible');
    const when=s.eta?`預計 ${etaText(s.eta)}`:'時間未定';
    if(ok&&mo!=null&&mo<=win)add({id:'G1',q:'新一代快來了嗎',effect:'next',status:'hit',detail:mo<0?`${s.name} 已經推出（${SUCC[s.status]}）。`:`${s.name} ${when}上市（${SUCC[s.status]}，約 ${Math.max(1,Math.round(mo))} 個月內）。`,ev:s.sources});
    else add({id:'G1',q:'新一代快來了嗎',effect:'next',status:s.status==='rumor'?'info':'pass',
      detail:`${s.name}：${SUCC[s.status]||s.status}，${when}`+(s.status==='rumor'?'（傳聞級，不進判定）。':mo!=null&&mo>win?`（超過 ${win} 個月窗口）。`:ok?'。':'（你設定「現在就要」，只看官方一個月內）。'),ev:s.sources});
  }

  // S1 開賣
  const st=p.status||'on-sale';
  if(st==='announced'||st==='rumored')add({id:'S1',q:'開賣了嗎',effect:'wait',status:'hit',detail:'還沒正式開賣，等上市價和實測出來。'});
  else add({id:'S1',q:'開賣了嗎',effect:'wait',status:st==='discontinued'?'info':'pass',detail:STATUS[st]||'已開賣'});

  // D1 瑕疵
  const iss=Array.isArray(p.issues)?p.issues:[];
  const bad=iss.filter(i=>i&&i.severity==='high'&&i.status!=='fixed');
  if(bad.length)add({id:'D1',q:'有重大瑕疵嗎',effect:'wait',status:'hit',issue:bad[0].title,detail:`${bad[0].title}（尚未解決）`+(bad.length>1?`，另有 ${bad.length-1} 項。`:'。'),ev:bad.filter(i=>i.url).map(i=>({title:i.title,url:i.url}))});
  else{const open=iss.filter(i=>i&&i.status!=='fixed');add({id:'D1',q:'有重大瑕疵嗎',effect:'wait',status:'pass',detail:open.length?`沒有重大問題，有 ${open.length} 項中低度問題要留意。`:'沒有未解決的問題。'})}

  // P1 價格
  const low90=num(P.low90),ref=num(P.ref);
  const refP=low90!=null?low90:ref;const refName=low90!=null?'近 90 天低點':(P.refLabel||'參考價');
  let target=null,prem=null;
  if(now==null||refP==null)add({id:'P1',q:'價格偏高嗎',effect:'wait',status:'na',detail:'缺少現價或參考價，這條先跳過。'});
  else{prem=(now-refP)/refP*100;target=Math.floor(refP*(1+thr.pricePremium/100));
    if(prem>=thr.pricePremium){
      if(urgency==='now')add({id:'P1',q:'價格偏高嗎',effect:'wait',status:'info',detail:`比${refName}高 ${prem.toFixed(1)}%；你設定「現在就要」，只提醒不擋。`});
      else add({id:'P1',q:'價格偏高嗎',effect:'wait',status:'hit',detail:`現價比${head(refName)} ${money(refP)} 高 ${prem.toFixed(1)}%（門檻 ${thr.pricePremium}%）。`});
    }else add({id:'P1',q:'價格偏高嗎',effect:'wait',status:'pass',detail:prem<=0?`現價不高於${refName}（${pctTxt(prem)}）。`:`只比${refName}高 ${prem.toFixed(1)}%，在門檻 ${thr.pricePremium}% 內。`});
  }
  const p1hit=L[L.length-1].status==='hit';

  // P2 大促
  const evs=eventsFor(ctx.calendar,cat,thr.saleDays);const trendUp=P.trend==='up';
  if(!evs.length)add({id:'P2',q:'大促快到了嗎',effect:'wait',status:'pass',detail:`${thr.saleDays} 天內沒有這類商品的大型促銷。`});
  else{const e=evs[0];const when=(/[A-Za-z0-9]$/.test(e.name)?' ':'')+(e.d===0?'就是今天':`還有 ${e.d} 天`);
    if(urgency==='now')add({id:'P2',q:'大促快到了嗎',effect:'wait',status:'info',detail:`${e.name}${when}；你設定「現在就要」，只提醒。`,ev:e.url?[{title:e.name,url:e.url}]:null,evName:e.name});
    else if(trendUp&&!p1hit)add({id:'P2',q:'大促快到了嗎',effect:'wait',status:'info',detail:`${e.name}${when}，但價格正在上漲，等折扣未必划算。`,ev:e.url?[{title:e.name,url:e.url}]:null,evName:e.name});
    else add({id:'P2',q:'大促快到了嗎',effect:'wait',status:'hit',detail:`${e.name}${when}`+(e.note?`：${e.note}`:'。'),ev:e.url?[{title:e.name,url:e.url}]:null,evName:e.name,evDate:e.date});
  }

  // T1 走勢
  const tr=P.trend||'unknown';
  if(tr==='down'&&urgency!=='now')add({id:'T1',q:'價格往哪走',effect:'wait',status:'hit',detail:TREND.down+(P.trendNote?`：${P.trendNote}`:'。'),ev:P.trendSources});
  else add({id:'T1',q:'價格往哪走',effect:'wait',status:'info',detail:(TREND[tr]||TREND.unknown)+(P.trendNote?`：${P.trendNote}`:'。')+(tr==='up'?'（越等越貴的風險）':''),ev:P.trendSources});

  // F1 新鮮度
  const age=daysSince(p.checkedAt);
  add({id:'F1',q:'資料夠新嗎',effect:null,status:age!=null&&age<=thr.freshDays?'pass':'info',
    detail:age==null?'沒有查證時間。':age<=thr.freshDays?ageText(p.checkedAt)+'。':`已經 ${age} 天沒查，建議請秘書重查（不影響判定）。`});

  let verdict='buy',cause=[];
  for(const eff of ['skip','next','wait']){const h=L.filter(l=>l.status==='hit'&&l.effect===eff);if(h.length){verdict=eff;cause=h;break}}
  const r={verdict,lines:L,cause,thr,urgency,budget,now,refP,refName,target,prem,best,ups,relevant,age};
  r.conclusion=conclude(p,r);r.watch=watchList(p,r,pr);r.conf=confidence(p,thr,now,age);
  return r;
}

function conclude(p,r){
  const c=r.cause[0];const more=r.cause.length>1?`另外還有 ${r.cause.length-1} 條規則指向同一個判定。`:'';
  if(r.verdict==='skip'){
    if(c.id==='N2')return '這是桌機零件，你目前沒有桌機，單買裝不起來，先不用花這筆錢。'+more;
    if(c.id==='B1')return `超出你的預算 ${money(r.now-r.budget)}，先不用買。`+more;
    return '對你勾選的用途沒有明顯升級，這筆錢先留著。'+more;
  }
  if(r.verdict==='next')return `${(p.successor||{}).name||'新一代'}快來了，現在買等於買在換代前夕。`+more;
  if(r.verdict==='wait'){
    if(c.id==='S1')return '還沒正式開賣，等上市價和實測再說。'+more;
    if(c.id==='D1')return `有尚未解決的重大問題（${c.issue||'見已知問題'}），等修正或改版再出手。`+more;
    if(c.id==='P1')return `價格偏高，回到 ${money(r.target)} 以下再出手。`+((p.price||{}).trend==='up'?'價格還在漲，短期不一定等得到。':'')+more;
    if(c.id==='P2')return `${tail(c.evName||'大促')}快到了，先等等看折扣。`+more;
    if(c.id==='T1')return '價格正在往下走，再觀察一陣子。'+more;
  }
  const L=id=>r.lines.find(l=>l.id===id);const parts=[];const P1=L('P1'),G1=L('G1');
  if(P1.status==='pass')parts.push('價格合理');
  else if(P1.status==='info')parts.push(`價格比參考價高 ${Math.round(r.prem)}%（你選了「現在就要」，只提醒不擋）`);
  else parts.push('沒有可比對的參考價');
  if(G1.status!=='hit')parts.push('短期沒有可信的新一代');
  const b=r.best;if(b)parts.push(`對你的${head(USE_LABEL[b.u])}是${LV[b.lv]}`);
  return `可判定的條件都過關：${parts.join('、')}。可以下單。`;
}

function watchList(p,r,pr){
  const w=[];const get=id=>r.lines.find(l=>l.id===id);const s=p.successor||{};
  const P1=get('P1'),B1=get('B1'),G1=get('G1'),P2=get('P2'),N1=get('N1'),N2=get('N2'),D1=get('D1');
  if(N2&&N2.status==='hit')w.push('你決定組桌機時：到「我」把桌機狀態改成「打算組桌機」，判定會重算。');
  if(N1&&N1.status==='hit'){const other=USES.map(([u])=>u).filter(u=>!(pr.uses||[]).includes(u)).map(u=>({u,lv:lvOf((p.gain||{})[u],r.thr)})).filter(x=>x.lv==='big'||x.lv==='some');
    if(other.length)w.push(`如果你開始需要${other.map(x=>USE_LABEL[x.u]).join('、')}：這幾項它是${other.map(x=>LV[x.lv]).join('、')}，判定會改變。`)}
  if(B1&&B1.status==='hit')w.push(`價格降到你的預算 ${money(r.budget)} 以下：預算這關就過了。`);
  if(G1&&G1.status==='hit')w.push(`${s.name} 上市後：請秘書重查，比較新舊價差（前一代常會降價）。`);
  else if(s.name&&s.status==='rumor')w.push(`${s.name} 若出現可信消息、而且在 ${r.thr.successorMonths} 個月內：會轉成「等新一代」。`);
  if(D1&&D1.status==='hit')w.push('問題修正或改版消息出來後：請秘書重查。');
  if(P1&&P1.status==='hit'&&r.target!=null)w.push(`價格降到 ${money(r.target)} 以下：價格這關就過了。`);
  if(P1&&P1.status==='pass'&&r.target!=null&&r.verdict==='buy')w.push(`價格漲到 ${money(r.target+1)} 以上：會轉成「再等等」。`);
  if(P2&&P2.status==='hit')w.push(`${P2.evName}當天：請秘書重查，看實際折扣。`);
  if(r.age!=null&&r.age>r.thr.freshDays)w.push('資料已過保鮮期：請秘書重查，更新價格。');
  return w.slice(0,5);
}

function confidence(p,thr,now,age){
  let s=0;if(now!=null)s++;if((p.sources||[]).length>=4)s++;if(age!=null&&age<=thr.freshDays)s++;
  return s>=3?'high':s===2?'mid':'low';
}
const CONF={high:['證據充足',3],mid:['證據普通',2],low:['證據不足',1]};

return {USES,USE_LABEL,CATS,V,V_ORDER,LV,LV_RANK,URG,DESK,SUCC,TREND,STATUS,DEFAULT_THR,DEFAULT_PROFILE,THR_META,RULES,CONF,
  setToday,today,num,money,pctTxt,pd,sod,daysUntil,monthsUntil,daysSince,etaText,ageText,tail,head,
  normProfile,lvOf,eventsFor,evaluate};
});
