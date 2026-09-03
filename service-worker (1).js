/* ============================================================================
   Audit Hôtel Pro · V23
   La V22 réécrivait le HTML à la volée pour y injecter /fixes-v21.js. Selon la
   version du worker enregistrée sur l'appareil, le correctif était présent ou
   absent : l'app ne se comportait pas deux fois pareil. Les correctifs sont
   désormais dans index.html ; ce worker ne fait plus que du cache.
   ========================================================================== */
const CACHE_NAME='audit-hotel-pro-v25';
const APP_SHELL=['/','/index.html','/manifest.webmanifest','/icon192.png','/icon512.png','/audithotellogo.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>Promise.all(
    APP_SHELL.map(url=>fetch(url,{cache:'reload'}).then(r=>r.ok?cache.put(url,r):null).catch(()=>null))
  )));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>k!==CACHE_NAME?caches.delete(k):null));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{ if(event.data==='skipWaiting')self.skipWaiting(); });

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  const isHtml=event.request.mode==='navigate'||url.pathname==='/'||url.pathname==='/index.html';

  /* HTML : réseau d'abord (toujours la dernière version), cache en secours. */
  if(isHtml){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(async response=>{
          if(response&&response.ok){
            const cache=await caches.open(CACHE_NAME);
            cache.put('/index.html',response.clone()).catch(()=>{});
          }
          return response;
        })
        .catch(async()=>(await caches.match(event.request))||(await caches.match('/index.html'))||Response.error())
    );
    return;
  }

  /* Assets : cache d'abord, rafraîchi en arrière-plan. */
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    const network=fetch(event.request).then(response=>{
      if(response&&response.ok&&APP_SHELL.includes(url.pathname)){
        caches.open(CACHE_NAME).then(c=>c.put(event.request,response.clone())).catch(()=>{});
      }
      return response;
    }).catch(()=>cached||Response.error());
    return cached||network;
  })());
});
