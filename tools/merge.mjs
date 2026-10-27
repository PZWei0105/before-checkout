/* 下單前：把自動追價（data/prices/<id>.json）合併進商品資料
 * tools/build.mjs 打包時呼叫；tests/merge_test.mjs 測這裡的規則。
 *
 * 判定用的現價：
 *   - 秘書查證價：查證後 7 天內有效。
 *   - 自動追價：抓到後 3 天內有效。
 *   - 兩個都有效就取比較低的；一樣低用秘書的。只剩一個有效就用那一個。
 *   - 都過期了，就用秘書最後查到的價格（App 會提醒重查）。
 * 每次都記下「為什麼用這個價格」（price.pick），App 照這個寫說明，不自己猜。 */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const E=require('../engine.js');

export const SRC_LABEL={pchome:'PChome 24h',coolpc:'原價屋'};
export const SEC_FRESH_DAYS=7;
export const AUTO_FRESH_DAYS=3;
const DAY=864e5;
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
export const twFmt=iso=>{const t=new Date(Date.parse(iso)+8*36e5);return `${t.getUTCMonth()+1}/${t.getUTCDate()} ${String(t.getUTCHours()).padStart(2,'0')}:${String(t.getUTCMinutes()).padStart(2,'0')}`};

/* p：商品資料（會被改寫），a：data/prices/<id>.json，nowMs：現在時間 */
export function mergeAuto(p,a,nowMs){
  const P={...(p.price||{})};
  const L=a.latest&&a.latest.status==='ok'&&Number.isFinite(a.latest.p)&&Date.parse(a.latest.at)?a.latest:null;
  const secAt=E.pd(p.checkedAt);const secAge=secAt?(nowMs-secAt.getTime())/DAY:Infinity;
  const hasSec=typeof P.now==='number';
  const secFresh=hasSec&&secAge<=SEC_FRESH_DAYS;
  const autoFresh=!!L&&(nowMs-Date.parse(L.at))/DAY<=AUTO_FRESH_DAYS;
  const sec=hasSec?{p:P.now,src:P.nowSource||null,url:P.nowUrl||null,at:p.checkedAt||null,fresh:secFresh}:null;
  const auto=L?{p:L.p,at:L.at,src:L.srcLabel,cond:L.cond||null,fresh:autoFresh}:null;
  let by,why;
  if(secFresh&&autoFresh){if(L.p<P.now){by='auto';why='lower'}else{by='secretary';why=L.p===P.now?'tie':'lower'}}
  else if(autoFresh){by='auto';why=hasSec?'secStale':'noSec'}
  else if(secFresh){by='secretary';why=L?'autoStale':'noAuto'}
  else if(hasSec){by='secretary';why='bothStale'}
  else{by=null;why='none'}
  if(by==='auto'){P.now=L.p;P.nowSource=`${L.srcLabel}（自動追價 ${twFmt(L.at)}${L.cond?'・'+L.cond:''}）`;P.nowUrl=L.url||null}
  P.nowBy=by;
  P.pick={by,why,sec,auto};
  const daily=(Array.isArray(a.daily)?a.daily:[]).filter(x=>x&&/^\d{4}-\d{2}-\d{2}$/.test(x.d)&&Number.isFinite(x.p));
  // 近 90 天低點：自動追價＋秘書紀錄，累積滿 30 天才採用
  const cutoff=new Date(nowMs-90*DAY).toISOString().slice(0,10);
  const pts=[...daily,...(Array.isArray(p.priceLog)?p.priceLog:[])].filter(x=>x&&x.d>=cutoff&&Number.isFinite(x.p));
  if(pts.length){
    const first=pts.map(x=>x.d).sort()[0];const span=(nowMs-Date.parse(first+'T00:00:00+08:00'))/DAY;
    if(span>=30){P.low90=Math.min(...pts.map(x=>x.p));P.low90Source=`自動追價＋秘書紀錄（近 ${Math.min(90,Math.round(span))} 天）`}
  }
  // 走勢：自動追價滿 10 筆，最近 3 筆平均對照前兩週平均
  if(daily.length>=10){
    const end=Date.parse(daily[daily.length-1].d);
    const win=daily.filter(x=>{const t=Date.parse(x.d);return t<=end-4*DAY&&t>=end-17*DAY});
    if(win.length>=3){
      const ch=(avg(daily.slice(-3).map(x=>x.p))-avg(win.map(x=>x.p)))/avg(win.map(x=>x.p))*100;
      P.trendSec={trend:P.trend,note:P.trendNote||null};
      P.trend=ch>3?'up':ch<-3?'down':'flat';
      P.trendNote=`自動追價：最近 3 次平均比前兩週${ch>=0?'高':'低'} ${Math.abs(ch).toFixed(1)}%`;
      P.trendSources=[];P.trendBy='auto';
    }
  }
  p.price=P;
  p.auto={status:a.status||'pending',checkedAt:a.checkedAt||null,
    latest:L?{p:L.p,at:L.at,src:L.srcLabel,title:L.title,url:L.url||null,cond:L.cond||null}:null,
    held:a.status==='held'&&a.held?{p:a.held.p,at:a.held.at,src:a.held.srcLabel,title:a.held.title,url:a.held.url||null,ref:a.held.ref,change:a.held.change}:null,
    sources:Object.fromEntries(Object.entries(a.sources||{}).map(([k,s])=>[k,{label:SRC_LABEL[k]||k,status:s.status,n:s.n??null,best:s.best||null}])),
    daily:daily.slice(-120)};
  return p;
}
