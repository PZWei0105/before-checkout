/* 自動追價合併規則的測試：node tests/merge_test.mjs
 * 重點是「判定用哪個價格、為什麼」：App 的說明文字照 price.pick 寫，這裡錯了 App 就會講錯。 */
import assert from 'node:assert/strict';
import {mergeAuto} from '../tools/merge.mjs';

const NOW=Date.parse('2026-10-28T07:00:00+08:00');
const daysAgo=(n,h=0)=>new Date(NOW-n*864e5-h*36e5).toISOString();
const twIso=ms=>new Date(ms+8*36e5).toISOString().slice(0,19)+'+08:00';
const prod=(o={})=>({id:'x',name:'測試商品',checkedAt:twIso(NOW-(o.secDays??1)*864e5),price:{currency:'TWD',now:o.sec===undefined?50000:o.sec,nowSource:'某通路',ref:52000,low90:null,trend:'flat'},priceLog:o.log||[]});
const prices=(o={})=>({id:'x',status:o.status||'ok',checkedAt:daysAgo(o.autoDays??0.2),
  latest:o.auto==null?null:{p:o.auto,at:daysAgo(o.autoDays??0.2),src:'pchome',srcLabel:'PChome 24h',title:'測試',url:'https://24h.pchome.com.tw/prod/X',status:'ok',cond:o.cond},
  daily:o.daily||[],sources:{pchome:{status:'ok',n:1,best:null}}});
let n=0;const t=(name,fn)=>{fn();n++;console.log('✓ '+name)};

t('兩邊都新：自動比較低就用自動',()=>{const p=mergeAuto(prod({sec:50000}),prices({auto:48000}),NOW).price;
  assert.equal(p.now,48000);assert.equal(p.nowBy,'auto');assert.equal(p.pick.why,'lower');assert.equal(p.pick.sec.p,50000)});
t('兩邊都新：秘書比較低就用秘書',()=>{const p=mergeAuto(prod({sec:47000}),prices({auto:48000}),NOW).price;
  assert.equal(p.now,47000);assert.equal(p.nowBy,'secretary');assert.equal(p.pick.why,'lower')});
t('兩邊一樣：用秘書，理由是 tie',()=>{const p=mergeAuto(prod({sec:48000}),prices({auto:48000}),NOW).price;
  assert.equal(p.nowBy,'secretary');assert.equal(p.pick.why,'tie')});
t('秘書價超過 7 天：改用自動，即使自動比較貴（理由 secStale）',()=>{const p=mergeAuto(prod({sec:47000,secDays:8}),prices({auto:49000}),NOW).price;
  assert.equal(p.now,49000);assert.equal(p.nowBy,'auto');assert.equal(p.pick.why,'secStale');assert.equal(p.pick.sec.p,47000);assert.equal(p.pick.sec.fresh,false)});
t('秘書沒查到現價：用自動（noSec）',()=>{const p=mergeAuto(prod({sec:null}),prices({auto:49000}),NOW).price;
  assert.equal(p.now,49000);assert.equal(p.pick.why,'noSec');assert.equal(p.pick.sec,null)});
t('自動價超過 3 天（機器人停了）：用秘書（autoStale）',()=>{const p=mergeAuto(prod({sec:50000}),prices({auto:40000,autoDays:4}),NOW).price;
  assert.equal(p.now,50000);assert.equal(p.nowBy,'secretary');assert.equal(p.pick.why,'autoStale')});
t('自動追價沒抓到：用秘書（noAuto）',()=>{const p=mergeAuto(prod({sec:50000}),prices({status:'none',auto:null}),NOW).price;
  assert.equal(p.nowBy,'secretary');assert.equal(p.pick.why,'noAuto')});
t('兩邊都過期：先用秘書最後的價格（bothStale）',()=>{const p=mergeAuto(prod({sec:50000,secDays:9}),prices({status:'none',auto:null}),NOW).price;
  assert.equal(p.now,50000);assert.equal(p.pick.why,'bothStale')});
t('限搭機的條件會寫進來源說明',()=>{const p=mergeAuto(prod({sec:60000,secDays:8}),prices({auto:53990,cond:'限搭機'}),NOW).price;
  assert.match(p.nowSource,/限搭機/);assert.equal(p.pick.auto.cond,'限搭機')});
t('近 90 天低點：未滿 30 天不算',()=>{const daily=Array.from({length:12},(_,i)=>({d:new Date(NOW-(11-i)*864e5+8*36e5).toISOString().slice(0,10),p:49000-i}));
  const p=mergeAuto(prod(),prices({auto:48990,daily}),NOW).price;assert.equal(p.low90,null)});
t('近 90 天低點：滿 30 天才用自己的紀錄',()=>{const daily=Array.from({length:31},(_,i)=>({d:new Date(NOW-(30-i)*864e5+8*36e5).toISOString().slice(0,10),p:i===5?45000:49000}));
  const p=mergeAuto(prod(),prices({auto:49000,daily}),NOW).price;assert.equal(p.low90,45000);assert.match(p.low90Source,/自動追價/)});
t('走勢：滿 10 筆才算，最近 3 次比前兩週低 5% 以上判下滑',()=>{const daily=Array.from({length:14},(_,i)=>({d:new Date(NOW-(13-i)*864e5+8*36e5).toISOString().slice(0,10),p:i>=11?45000:50000}));
  const p=mergeAuto(prod(),prices({auto:45000,daily}),NOW).price;assert.equal(p.trend,'down');assert.equal(p.trendBy,'auto');assert.equal(p.trendSec.trend,'flat')});
t('走勢：不滿 10 筆就保留秘書的',()=>{const daily=Array.from({length:9},(_,i)=>({d:new Date(NOW-(8-i)*864e5+8*36e5).toISOString().slice(0,10),p:50000-i*500}));
  const p=mergeAuto(prod(),prices({auto:46000,daily}),NOW).price;assert.equal(p.trend,'flat');assert.equal(p.trendBy,undefined)});
t('被擋下的價格不會變成現價',()=>{const a=prices({auto:50000});a.status='held';a.held={p:30000,at:daysAgo(0.1),srcLabel:'PChome 24h',title:'怪價格',ref:50000,change:-0.4};
  const q=mergeAuto(prod({sec:52000,secDays:8}),a,NOW);assert.equal(q.price.now,50000);assert.equal(q.auto.held.p,30000)});

console.log(`\n${n} 項全部通過`);
