/* GymPath: neutral CSV/JSON data adapter. No access to Wayfarer or Pokémon GO services. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GymPathImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const alias = {
    name:['name','title','nazwa','gym','gymname','gym_name','pokemongym'],
    lat:['lat','latitude','szerokosc','szerokoscgeograficzna','latitudee6'],
    lng:['lng','lon','long','longitude','dlugosc','dlugoscgeograficzna','longitudee6'],
    type:['type','kind','category','gametype','entitytype','gmotype','poi_type'],
    popularity:['popularity','popularnosc'],
    status:['status']
  };
  const norm = s => String(s ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const column = (o, key) => {
    const keys = Object.keys(o || {});
    const found = keys.find(k => alias[key].some(a => norm(k) === norm(a)));
    return found === undefined ? undefined : o[found];
  };
  function rowsFromDelimited(text) {
    const head = text.split(/\r?\n/,1)[0];
    const hits = d => {let n=0,quoted=false;for(let i=0;i<head.length;i++){if(head[i]==='"'){if(quoted&&head[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted&&head[i]===d)n++;}return n;};
    const delimiter = ['\t',';',','].sort((a,b)=>hits(b)-hits(a))[0];
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(c===delimiter&&!quoted){row.push(cell.trim());cell='';}
      else if((c==='\r'||c==='\n')&&!quoted){
        if(c==='\r'&&text[i+1]==='\n')i++;
        row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';
      }else cell+=c;
    }
    if(quoted)throw Error('Niedomknięty cudzysłów w pliku CSV.');
    row.push(cell.trim());if(row.some(Boolean))rows.push(row);
    return rows;
  }
  function unpackJSON(json) {
    if(Array.isArray(json))return json;
    if(json && typeof json==='object'){
      if(json.type==='FeatureCollection' && Array.isArray(json.features))return json.features;
      for(const key of ['gyms','results','items','data'])if(Array.isArray(json[key]))return json[key];
    }
    throw Error('JSON musi zawierać listę Gymów, pole gyms/items/results/data lub GeoJSON FeatureCollection.');
  }
  function record(raw, geojson=false) {
    if(!raw || typeof raw!=='object')return null;
    const props=raw.type==='Feature' && raw.properties ? raw.properties : raw;
    const type = column(props,'type') ?? props.gmo?.type ?? props.gmo?.entityType;
    if(type && !/gym/i.test(String(type)))return null;
    if(geojson && !type)return null; // Unlabeled GeoJSON may contain ordinary Wayspots/PokéStops.
    let lat=column(props,'lat'),lng=column(props,'lng');
    if(raw.type==='Feature' && raw.geometry?.type==='Point' && Array.isArray(raw.geometry.coordinates)){
      lng=raw.geometry.coordinates[0];lat=raw.geometry.coordinates[1];
    }
    const numeric = n => typeof n==='string' ? Number(n.trim().replace(',','.')) : Number(n);
    lat=numeric(lat);lng=numeric(lng);
    let name=String(column(props,'name')??'').trim();
    if(!name || name.length>120 || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180)return null;
    const popularity=numeric(column(props,'popularity'));
    const status=String(column(props,'status')??'unknown');
    return {name:name.slice(0,100),lat,lng,popularity:Number.isInteger(popularity)&&popularity>=1&&popularity<=5?popularity:3,status:['unknown','friendly','full','enemy','mine','unavailable'].includes(status)?status:'unknown'};
  }
  function parseText(input) {
    const text=String(input??'').replace(/^\uFEFF/,'').trim();
    if(!text)throw Error('Wklej dane lub wskaż niepusty plik.');
    if(text.length>8_000_000)throw Error('Plik jest za duży (maksymalnie 8 MB).');
    let raw=[],geojson=false;
    if(text[0]==='[' || text[0]==='{'){
      const json=JSON.parse(text);geojson=json?.type==='FeatureCollection';raw=unpackJSON(json);
    }else{
      const rows=rowsFromDelimited(text);
      if(!rows.length)throw Error('Nie znaleziono wierszy.');
      const first=rows[0].map(norm);
      const hasHeader=first.some(h=>alias.lat.some(a=>norm(a)===h)) &&
                      first.some(h=>alias.lng.some(a=>norm(a)===h));
      if(hasHeader){
        const headings=rows.shift();
        raw=rows.map(r=>Object.fromEntries(headings.map((h,i)=>[h,r[i]??''])));
      }else{
        if(rows[0].length!==3)throw Error('Wymagane kolumny name,lat,lng albo wiersze: Nazwa; szerokość; długość.');
        raw=rows.map(r=>({name:r[0],lat:r[1],lng:r[2]}));
      }
    }
    if(raw.length>10000)throw Error('Za dużo punktów (maksymalnie 10 000).');
    const gyms=raw.map(x=>record(x,geojson)).filter(Boolean);
    return {gyms,skipped:raw.length-gyms.length,total:raw.length};
  }
  function distanceKm(a,b){
    const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad;
    const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
    return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function withinRadius(gyms,start,radiusKm){
    if(!start||!Number.isFinite(+start.lat)||!Number.isFinite(+start.lng)||!Number.isFinite(+radiusKm)||radiusKm<=0)throw Error('Najpierw wskaż start i promień.');
    return gyms.filter(g=>distanceKm(start,g)<=radiusKm+1e-9);
  }
  function sourceUrl(input,start,radiusKm){
    const template=String(input??'').trim();
    if(!template)throw Error('Podaj adres publicznego pliku CSV/JSON lub API z prawem do wykorzystania.');
    const tokens={lat:start?.lat,lng:start?.lng,radiusKm};
    const expanded=template.replace(/\{(lat|lng|radiusKm)\}/g,(_,key)=>encodeURIComponent(String(tokens[key])));
    let url;try{url=new URL(expanded)}catch{throw Error('Niepoprawny URL. Użyj pełnego adresu https://…');}
    if(url.protocol!=='https:')throw Error('Źródło musi używać HTTPS.');
    if(url.username||url.password)throw Error('Nie podawaj danych logowania w adresie URL.');
    return url.href;
  }
  return {parseText,withinRadius,sourceUrl};
});
