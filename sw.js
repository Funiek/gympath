const CACHE='gympath-shell-v4';
const APP=['./','./index.html','./style.css','./core.js','./importer.js','./app.js','./manifest.webmanifest','./assets/icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const r=event.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;event.respondWith(fetch(r).then(resp=>{if(resp.ok){const clone=resp.clone();caches.open(CACHE).then(c=>c.put(r,clone)).catch(()=>{});}return resp;}).catch(()=>caches.match(r)));});