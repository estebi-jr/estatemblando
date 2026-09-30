/* Service worker: la app abre sin internet y se actualiza sola.
   build.py reemplaza estatemblando, 4425f8d6 (hash del index) y ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"] (archivos a guardar). */
const CORE='estatemblando-core-4425f8d6';   /* nombres únicos por app: varias apps comparten el mismo origen en github.io */
const FONTS='estatemblando-fonts';
const FILES=["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CORE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('estatemblando-core-')&&k!==CORE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
function timeout(ms){return new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))}
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  /* La app: primero internet (recibe actualizaciones); sin conexión, la copia guardada. */
  if(req.mode==='navigate'){
    e.respondWith((async()=>{
      try{
        const res=await Promise.race([fetch(req),timeout(4000)]);
        if(res&&res.ok){const c=await caches.open(CORE);c.put('./index.html',res.clone())}
        return res;
      }catch(err){
        return (await caches.match('./index.html'))||(await caches.match('./'))||Response.error();
      }
    })());
    return;
  }
  /* Íconos, manifest y demás archivos propios: copia guardada primero. */
  if(url.origin===self.location.origin){
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CORE).then(c=>c.put(req,copy))}return res})));
    return;
  }
  /* Tipografías: copia guardada al instante y se actualiza por detrás. */
  if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com'){
    e.respondWith(caches.open(FONTS).then(async c=>{
      const hit=await c.match(req);
      const net=fetch(req).then(res=>{if(res&&(res.ok||res.type==='opaque'))c.put(req,res.clone());return res}).catch(()=>hit);
      return hit||net;
    }));
  }
});
