(()=>{
'use strict';
const C=window.PokeGymCore,$=id=>document.getElementById(id),KEY='gympath-local-v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults=()=>({version:1,start:null,gyms:[]});
let data=defaults(),map,routeLayer=null,startMarker=null,circle=null,selecting='start',editing=null,historyId=null,requestId=0,routeNow=null;
let markers=new Map();
const newid=()=>globalThis.crypto?.randomUUID?.()??Date.now()+'-'+Math.random();
const notice=s=>$('map-hint').textContent=s;
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){notice('Nie można zapisać danych. Wyeksportuj kopię JSON.')}};
const statusName=s=>({unknown:'nieznany',friendly:'Twoja drużyna – miejsce',full:'Twoja drużyna – pełny',enemy:'przeciwna drużyna',mine:'Twój Pokémon broni',unavailable:'niedostępny'}[s]||'nieznany');
const today=()=>new Date().toLocaleDateString('en-CA');
function validGym(g){
 if(!g||!String(g.name||'').trim()||!C.isCoord(g))return null;
 return {id:String(g.id||newid()),name:String(g.name).trim().slice(0,100),lat:Number(g.lat),lng:Number(g.lng),popularity:C.clamp(Number(g.popularity)||3,1,5),status:['unknown','friendly','full','enemy','mine','unavailable'].includes(g.status)?g.status:'unknown',history:Array.isArray(g.history)?g.history.slice(0,2000).filter(h=>Number.isFinite(Number(h.hours))&&Number(h.hours)>=0&&Number(h.hours)<=8760).map(h=>({id:String(h.id||newid()),hours:Number(h.hours),date:String(h.date||'').slice(0,10)})):[],placedAt:g.placedAt&&Number.isFinite(Date.parse(g.placedAt))?new Date(g.placedAt).toISOString():null};
}
function validate(v){
 if(!v||!Array.isArray(v.gyms))throw Error('Niepoprawna kopia JSON');
 const start=C.isCoord(v.start)?{lat:Number(v.start.lat),lng:Number(v.start.lng)}:null;
 const gyms=v.gyms.slice(0,3000).map(validGym).filter(Boolean);let ids=new Set();
 for(const g of gyms){if(ids.has(g.id))g.id=newid();ids.add(g.id)}
 return {version:1,start,gyms};
}
try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(v)data=validate(v)}catch(e){console.warn(e)}
if(!window.L){notice('Mapa nie mogła się załadować. Sprawdź połączenie internetowe.');return}
map=L.map('map',{zoomControl:false}).setView(data.start?[data.start.lat,data.start.lng]:[53.1325,23.1688],data.start?14:12);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
function draw(){
 for(const m of markers.values())map.removeLayer(m);markers.clear();
 for(const g of data.gyms){
   const chosen=routeNow?.stops.some(s=>s.id===g.id);
   const color=chosen?'#ae3fbd':g.popularity>=4?'#d07a2d':g.popularity<=2?'#159f7c':'#314f8b';
   const marker=L.circleMarker([g.lat,g.lng],{radius:13,color:'#fff',weight:2,fillColor:color,fillOpacity:1}).addTo(map);
   marker.bindPopup('<strong>'+esc(g.name)+'</strong><br>Popularność '+g.popularity+'/5<br>'+esc(statusName(g.status))+'<br><button class="popup-edit">Edytuj Gym</button>');
   marker.on('popupopen',()=>{marker.getPopup().getElement()?.querySelector('.popup-edit')?.addEventListener('click',()=>{marker.closePopup();openGym(g)})});
   markers.set(g.id,marker);
 }
 if(startMarker)map.removeLayer(startMarker);if(circle)map.removeLayer(circle);
 if(data.start){
   startMarker=L.circleMarker([data.start.lat,data.start.lng],{radius:10,color:'#fff',weight:2,fillColor:'#1cbd8a',fillOpacity:1}).addTo(map).bindPopup('Punkt startowy');
   circle=L.circle([data.start.lat,data.start.lng],{radius:+$('radius').value*1000,color:'#159f7c',weight:1,fillColor:'#59d9bd',fillOpacity:.045,interactive:false}).addTo(map);
 }
 renderGyms();
}
function clearRoute(){requestId++;routeNow=null;if(routeLayer){map.removeLayer(routeLayer);routeLayer=null}}
function pick(mode){selecting=mode;$('set-start').classList.toggle('active',mode==='start');$('add-gym').classList.toggle('active',mode==='gym');notice(mode==='gym'?'Dotknij mapy, by dodać Gym.':'Dotknij mapy, by ustawić start.')}
map.on('click',e=>{
 if(selecting==='gym'){openGym(null,e.latlng);return}
 data.start={lat:e.latlng.lat,lng:e.latlng.lng};save();clearRoute();draw();notice('Punkt startowy ustawiony.')
});
$('set-start').onclick=()=>pick('start');$('add-gym').onclick=()=>pick('gym');
$('locate').onclick=()=>{
 if(!navigator.geolocation){notice('Brak GPS w przeglądarce. Wskaż start na mapie.');return}
 navigator.geolocation.getCurrentPosition(pos=>{data.start={lat:pos.coords.latitude,lng:pos.coords.longitude};save();clearRoute();draw();map.setView([data.start.lat,data.start.lng],15);notice('Punkt startowy ustawiony z GPS.')},()=>notice('Brak dostępu do lokalizacji. Wskaż start na mapie.'),{enableHighAccuracy:true,timeout:10000})
};
for(const b of document.querySelectorAll('.tab'))b.onclick=()=>{for(const t of document.querySelectorAll('.tab'))t.classList.toggle('active',t===b);for(const p of document.querySelectorAll('.page'))p.classList.toggle('active',p.id==='page-'+b.dataset.tab);setTimeout(()=>map.invalidateSize(),70)};
function openGym(g,point){
 editing=g?.id||null;$('gym-dialog-title').textContent=g?'Edytuj Gym':'Nowy Gym';
 $('gym-name').value=g?.name||'';$('gym-lat').value=g?.lat??point?.lat??'';$('gym-lng').value=g?.lng??point?.lng??'';
 $('gym-pop').value=String(g?.popularity||3);$('gym-status').value=g?.status||'unknown';$('delete-gym').hidden=!g;$('gym-dialog').showModal();
}
$('gym-form').onsubmit=e=>{
 e.preventDefault();const name=$('gym-name').value.trim(),lat=Number($('gym-lat').value),lng=Number($('gym-lng').value);
 if(!name||!$('gym-lat').value||!$('gym-lng').value||!C.isCoord({lat,lng})){alert('Podaj nazwę i poprawne współrzędne.');return}
 const old=data.gyms.find(g=>g.id===editing);
 const next=validGym({...old,id:old?.id||newid(),name,lat,lng,popularity:+$('gym-pop').value,status:$('gym-status').value});
 if(old)data.gyms[data.gyms.findIndex(g=>g.id===editing)]=next;else data.gyms.push(next);
 save();clearRoute();draw();$('gym-dialog').close();notice('Zapisano Gym '+name)
};
$('close-dialog').onclick=()=>$('gym-dialog').close();
$('delete-gym').onclick=()=>{const g=data.gyms.find(g=>g.id===editing);if(g&&confirm('Usunąć Gym '+g.name+' razem z historią?')){data.gyms=data.gyms.filter(g=>g.id!==editing);save();clearRoute();draw();$('gym-dialog').close()}};
function renderGyms(){
 const list=$('gym-list');list.replaceChildren();
 if(!data.gyms.length){list.textContent='Nie masz jeszcze Gymów. Dodaj je przyciskiem ＋ Gym na mapie.';return}
 for(const g of [...data.gyms].sort((a,b)=>a.name.localeCompare(b.name,'pl'))){
 const card=document.createElement('article');card.className='gym-card';
 card.innerHTML='<div class="gym-title"><strong>'+esc(g.name)+'</strong><span class="tag">'+g.popularity+'/5 · '+C.gymValue(g)+' pkt</span></div><p class="gym-meta">'+esc(statusName(g.status))+' · ~'+C.defenseHours(g).toFixed(1)+' h · '+g.history.length+' wpisów'+(g.placedAt?' · obrona trwa':'')+'</p><div class="gym-actions"><button class="edit">Edytuj</button><button class="history">Historia</button><button class="place">'+(g.placedAt?'Wrócił teraz':'Umieść teraz')+'</button><button class="show">Pokaż</button></div>';
 card.querySelector('.edit').onclick=()=>openGym(g);card.querySelector('.history').onclick=()=>openHistory(g);
 card.querySelector('.show').onclick=()=>{document.querySelector('[data-tab="route"]').click();map.setView([g.lat,g.lng],17);markers.get(g.id)?.openPopup()};
 card.querySelector('.place').onclick=()=>{
 if(!g.placedAt){g.placedAt=new Date().toISOString();g.status='mine';notice('Rozpoczęto pomiar obrony: '+g.name)}
 else{const hours=Math.max(0,(Date.now()-Date.parse(g.placedAt))/3600000);g.history.push({id:newid(),hours:+hours.toFixed(2),date:today()});g.placedAt=null;g.status='unknown';notice('Zapisano '+hours.toFixed(1)+' h obrony: '+g.name)}
 save();clearRoute();draw()
 };list.append(card)
 }
}
function openHistory(g){historyId=g.id;$('history-name').textContent=g.name;$('history-hours').value='';$('history-date').value=today();renderHistory();$('history-dialog').showModal()}
function renderHistory(){
 const g=data.gyms.find(x=>x.id===historyId),node=$('history-list');node.replaceChildren();
 for(const h of (g?.history||[]).slice().reverse()){
 const line=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');
 label.textContent=(h.date||'Bez daty')+' · '+h.hours.toFixed(1)+' h';button.textContent='Usuń';
 button.onclick=()=>{g.history=g.history.filter(x=>x.id!==h.id);save();renderHistory();draw()};line.append(label,button);node.append(line)
 }
 if(!g?.history?.length)node.textContent='Brak zapisanych powrotów.'
}
$('close-history').onclick=()=>$('history-dialog').close();
$('history-form').onsubmit=e=>{
 e.preventDefault();const g=data.gyms.find(x=>x.id===historyId),hours=+$('history-hours').value;
 if(!g||!$('history-hours').value||!Number.isFinite(hours)||hours<0||hours>8760){alert('Podaj poprawny czas obrony.');return}
 g.history.push({id:newid(),hours,date:$('history-date').value});save();draw();$('history-dialog').close()
};
for(const [input,out] of [['radius','radius-out'],['distance','distance-out']])$(input).oninput=()=>{$(out).textContent=$(input).value+' km';if(input==='radius'&&circle)circle.setRadius(+$('radius').value*1000)};
const settings=()=>({radiusKm:+$('radius').value,maxKm:+$('distance').value,mode:$('mode').value,maxStops:+$('max-stops').value,roundtrip:$('roundtrip').checked,avoidBusy:$('avoid-busy').checked});
function renderRoute(stops,estimate,actual,warning,coords){
 const mode={walk:'pieszo',bike:'rowerem',car:'samochodem'}[settings().mode];
 const distance=actual===null?'Szacunkowa długość: '+estimate.toFixed(1)+' km (niezweryfikowana)':'Długość po drogach: '+actual.toFixed(1)+' km';
 const rows=stops.map((g,i)=>'<li><strong>'+(i+1)+'. '+esc(g.name)+'</strong> · popularność '+g.popularity+'/5 · ~'+C.defenseHours(g).toFixed(0)+' h obrony<br><span class="muted">Ocena orientacyjna '+g.value+'/100 · '+esc(statusName(g.status))+'</span></li>').join('');
 const link=stops.length?'<p><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query='+stops[0].lat+'%2C'+stops[0].lng+'">Nawiguj do pierwszego Gymu ↗</a></p>':'';
 $('route-result').innerHTML='<h3>'+stops.length+' Gymów · '+mode+'</h3><p class="'+(actual===null?'warning':'success')+'">'+distance+'</p>'+(warning?'<p class="warning">'+esc(warning)+'</p>':'')+'<ol>'+rows+'</ol>'+link+'<p class="muted">Ocena jest orientacyjna. Nie przewiduje faktycznych monet ani dostępności Gymów.</p>';
 if(routeLayer)map.removeLayer(routeLayer);
 const points=coords||[data.start,...stops,...(settings().roundtrip?[data.start]:[])].map(p=>[p.lat,p.lng]);
 routeLayer=L.polyline(points,{color:actual===null?'#e89036':'#825ce0',weight:5,opacity:.92,dashArray:actual===null?'8 9':null}).addTo(map);
 const layers=L.featureGroup([routeLayer,...stops.map(g=>markers.get(g.id)).filter(Boolean)]);map.fitBounds(layers.getBounds().pad(.20),{maxZoom:16});routeNow={stops,actual};draw()
}
async function routeByRoad(stops,opts){
 const places=[data.start,...stops,...(opts.roundtrip?[data.start]:[])],costing={walk:'pedestrian',bike:'bicycle',car:'auto'}[opts.mode];
 const query={locations:places.map(p=>({lat:p.lat,lon:p.lng})),costing,directions_options:{units:'kilometers',language:'pl-PL'}};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
 const response=await fetch('https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(query)),{signal:controller.signal});
 if(!response.ok)throw Error('HTTP '+response.status);const body=await response.json();
 if(!body.trip?.legs?.length||!Number.isFinite(body.trip?.summary?.length))throw Error('Brak trasy po drogach.');
 let coords=[];for(const leg of body.trip.legs){const part=C.decodePolyline6(leg.shape);coords.push(...(coords.length?part.slice(1):part))}
 return {km:body.trip.summary.length,coords}
 }finally{clearTimeout(timer)}
}
$('plan').onclick=async()=>{
 const opts=settings();clearRoute();const ticket=requestId;
 if(!data.start){$('route-result').textContent='Wskaż punkt startowy na mapie.';return}
 const draft=C.plan(data.gyms,data.start,opts);
 if(!draft.stops.length){$('route-result').textContent='Brak pasujących Gymów w zadanym promieniu i szacunkowym limicie. Dodaj Gymy, zwiększ limit lub wyłącz filtr popularności.';return}
 $('route-result').textContent='Sprawdzam trasę po drogach i ścieżkach…';let stops=draft.stops.slice(),attempt=0;
 while(stops.length&&attempt++<9){
 try{const route=await routeByRoad(stops,opts);if(ticket!==requestId)return;if(route.km<=opts.maxKm+.001){renderRoute(stops,draft.estimateKm,route.km,stops.length<draft.stops.length?'Skrócono trasę, aby zmieścić się w limicie.':'',route.coords);return}stops.pop()}
 catch(e){if(ticket!==requestId)return;renderRoute(stops,draft.estimateKm,null,'Nie udało się pobrać trasy po drogach ('+e.message+'). Pomarańczowy szkic w linii prostej NIE potwierdza limitu kilometrów ani możliwości przejścia/przejazdu.',null);return}
 }
 if(ticket===requestId)$('route-result').textContent='Żadna sprawdzona trasa nie mieści się w limicie. Zwiększ limit lub zmniejsz liczbę Gymów.'
};
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
$('export-json').onclick=()=>download('gympath-kopia-'+today()+'.json',JSON.stringify(data,null,2),'application/json');
$('import-json').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{const v=validate(JSON.parse(await file.text()));if(!confirm('Zastąpić obecne dane kopią zawierającą '+v.gyms.length+' Gymów?'))return;data=v;save();clearRoute();draw();if(data.start)map.setView([data.start.lat,data.start.lng],14);notice('Zaimportowano kopię JSON.')}catch(e){alert('Błąd importu: '+e.message)}finally{e.target.value=''}};
const csvCell=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
$('export-csv').onclick=()=>download('gympath-gymy-'+today()+'.csv','name,lat,lng,popularity,status\n'+data.gyms.map(g=>[g.name,g.lat,g.lng,g.popularity,g.status].map(csvCell).join(',')).join('\n'),'text/csv;charset=utf-8');
function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
 else if(c===','&&!quoted){row.push(cell);cell=''}
 else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}
 else cell+=c}
 if(quoted)throw Error('Niedomknięty cudzysłów w CSV');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows
}
$('import-csv').onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
 const rows=parseCSV((await file.text()).replace(/^\uFEFF/,''));if(!rows.length)throw Error('Pusty plik');
 const headers=rows.shift().map(h=>h.trim().toLowerCase());
 for(const key of ['name','lat','lng'])if(!headers.includes(key))throw Error('Brak kolumny '+key);
 let added=0,skipped=0;
 for(const row of rows){const obj=Object.fromEntries(headers.map((h,i)=>[h,row[i]??'']));
 if(!obj.lat?.trim()||!obj.lng?.trim()){skipped++;continue}
 const g=validGym({...obj,id:newid(),lat:Number(obj.lat),lng:Number(obj.lng),popularity:Number(obj.popularity||3)});
 if(!g||data.gyms.some(x=>x.name.toLowerCase()===g.name.toLowerCase()&&C.haversine(x,g)<.015)){skipped++;continue}
 data.gyms.push(g);added++}
 save();clearRoute();draw();alert('Dodano '+added+' Gymów; pominięto '+skipped)
 }catch(err){alert('Błąd CSV: '+err.message)}finally{e.target.value=''}
};

/* Import adapter: user-provided or explicitly authorized data only. */
const importer=window.GymPathImport;
function mergeImportedGyms(parsed, origin){
  if(!data.start)throw Error('Wskaż najpierw punkt startowy na mapie.');
  const near=importer.withinRadius(parsed.gyms,data.start,+$('radius').value);
  let added=0,duplicates=0;
  for(const item of near){
    const found=data.gyms.find(g=>C.haversine(g,item)<0.025 && g.name.toLocaleLowerCase('pl')===item.name.toLocaleLowerCase('pl'));
    if(found){duplicates++;continue}
    if(data.gyms.length>=3000)throw Error('Osiągnięto limit 3000 Gymów w pamięci. Wyeksportuj kopię lub usuń niepotrzebne punkty.');
    const g=validGym({...item,id:newid(),source:origin});if(g){data.gyms.push(g);added++}
  }
  save();clearRoute();draw();
  const text='Źródło: '+origin+'. Dodano '+added+' Gymów w promieniu '+$('radius').value+' km; pominięto '+duplicates+' duplikatów oraz '+(parsed.gyms.length-near.length)+' punktów spoza promienia.'+(parsed.skipped?' '+parsed.skipped+' wierszy nie rozpoznano jako Gymy.':'');
  $('import-result').textContent=text;notice('Import zakończony: '+added+' nowych Gymów.');
  return added;
}
function processGymImport(raw,origin){
  if(!data.start)throw Error('Najpierw ustaw start na mapie, by filtrować dane w promieniu.');
  const parsed=importer.parseText(raw);
  if(!parsed.gyms.length)throw Error('Nie znaleziono Gymów. Plik powinien zawierać nazwę i współrzędne, a plik mieszany także oznaczenie type=gym.');
  return mergeImportedGyms(parsed,origin);
}
$('import-pasted').onclick=()=>{
  try{processGymImport($('paste-gyms').value,'wklejone dane');}
  catch(e){$('import-result').textContent='Błąd importu: '+e.message}
};
$('import-geo-file').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{if(file.size>8_000_000)throw Error('Plik jest za duży (maks. 8 MB).');processGymImport(await file.text(),file.name);}
  catch(err){$('import-result').textContent='Błąd importu: '+err.message}
  finally{e.target.value=''}
};
$('import-source').onclick=async()=>{
  const btn=$('import-source');if(btn.disabled)return;
  try{
    if(!data.start)throw Error('Wskaż punkt startowy na mapie.');
    const url=importer.sourceUrl($('gym-source-url').value,data.start,+$('radius').value);
    if(!confirm('Pobrać Gymy z podanego adresu? Korzystaj wyłącznie ze źródeł, które zezwalają na pobieranie ich danych.'))return;
    btn.disabled=true;$('import-result').textContent='Pobieranie danych z publicznego źródła…';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(url,{method:'GET',credentials:'omit',mode:'cors',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      const length=Number(response.headers.get('content-length'));if(Number.isFinite(length)&&length>8_000_000)throw Error('Plik jest za duży (maks. 8 MB).');
      const raw=await response.text();if(raw.length>8_000_000)throw Error('Odpowiedź jest za duża (maks. 8 MB).');
      processGymImport(raw,new URL(url).hostname);
    }finally{clearTimeout(timer)}
  }catch(err){$('import-result').textContent='Nie udało się pobrać danych: '+err.message+'. Źródło może nie udostępniać CORS lub nie obsługiwać tego formatu.'}
  finally{btn.disabled=false}
};

$('delete-all').onclick=()=>{if(confirm('Usunąć wszystkie zapisane Gymy, historię i punkt startowy? Najpierw rozważ eksport JSON.')){data=defaults();save();clearRoute();draw();$('route-result').textContent='Dane zostały usunięte.'}};
let installPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').hidden=false});
$('install').onclick=async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('install').hidden=true}};
if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>{});
draw();if(data.start)notice('Punkt startowy wczytany. Możesz wyznaczyć trasę.');
})();