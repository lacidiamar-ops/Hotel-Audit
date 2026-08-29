const CACHE_NAME='audit-hotel-pro-v22-cdc-mobile';
const APP_SHELL=['/','/index.html','/manifest.webmanifest','/icon192.png','/icon512.png','/fixes-v21.js'];
const PATCH_TAG='<script src="/fixes-v21.js?v=21"></script>';

async function injectPatch(response){
  if(!response || !response.ok)return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('/fixes-v21.js'))html=html.replace('</body>',PATCH_TAG+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-cache');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>Promise.all(APP_SHELL.map(url=>fetch(url,{cache:'reload'}).then(r=>r.ok?cache.put(url,r):null).catch(()=>null)))));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>k!==CACHE_NAME?caches.delete(k):null));
    await self.clients.claim();
    const clients=await self.clients.matchAll({type:'window'});
    clients.forEach(client=>client.navigate(client.url));
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const isHtml=event.request.mode==='navigate'||url.pathname==='/'||url.pathname==='/index.html';
  if(isHtml){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(injectPatch)
        .then(async response=>{if(response&&response.ok){const cache=await caches.open(CACHE_NAME);cache.put(event.request,response.clone()).catch(()=>{});}return response;})
        .catch(async()=>{
          const cached=await caches.match(event.request)||await caches.match('/index.html');
          return injectPatch(cached);
        })
    );
    return;
  }
  event.respondWith(
    fetch(event.request,{cache:'no-store'}).then(response=>{
      if(response.ok&&APP_SHELL.includes(url.pathname))caches.open(CACHE_NAME).then(cache=>cache.put(event.request,response.clone())).catch(()=>{});
      return response;
    }).catch(()=>caches.match(event.request))
  );
});
