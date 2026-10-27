/* 下單前 service worker
 * 網路優先：有網路就拿最新的，沒網路才用存檔；所以 App 更新後不會卡在舊版本。
 * 字型（Google Fonts）存起來重複用。VERSION 裡的版本號由 tools/build.mjs 打包時填入。 */
const VERSION='bc-__BUILD__';
const FONTS='bc-fonts';
const SHELL=['./','./index.html','./app.css','./app.js','./engine.js','./updates.js','./manifest.webmanifest','./icons/icon-192.png','./icons/apple-touch-icon.png','./data/bundle.json'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).catch(()=>{}).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION&&k!==FONTS&&k.startsWith('bc-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    e.respondWith(caches.open(FONTS).then(async c=>{
      const hit=await c.match(req);if(hit)return hit;
      try{const res=await fetch(req);if(res&&(res.ok||res.type==='opaque'))c.put(req,res.clone());return res}
      catch(err){return new Response('',{status:504})}
    }));
    return;
  }
  if(url.origin!==self.location.origin)return;
  // 資料檔帶時間參數防快取；存檔時去掉參數，離線時才找得到。
  const isData=url.pathname.endsWith('/data/bundle.json');
  const key=isData?new Request(url.origin+url.pathname):req;
  e.respondWith(
    fetch(req).then(res=>{
      if(res&&res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(key,copy))}
      return res;
    }).catch(async()=>{
      const hit=await caches.match(key,{ignoreSearch:true});
      if(hit&&isData){
        // 告訴 App：這是離線存檔，不是剛同步到的新資料。
        const h=new Headers(hit.headers);h.set('X-BC-Offline','1');
        return new Response(await hit.blob(),{status:200,headers:h});
      }
      if(hit)return hit;
      if(req.mode==='navigate'){const shell=await caches.match('./index.html');if(shell)return shell}
      return new Response('離線中，而且還沒有存檔。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    })
  );
});
