/* Pure, dependency-free planning helpers. Exports work in browsers and Node tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PokeGymCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const RAD = Math.PI / 180;
  const BASE_HOURS = {1: 72, 2: 36, 3: 18, 4: 9, 5: 2.5};
  function haversine(a, b) {
    const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
    const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*RAD)*Math.cos(b.lat*RAD)*Math.sin(dLng/2)**2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function isCoord(p) { return p && Number.isFinite(+p.lat) && +p.lat >= -90 && +p.lat <= 90 && Number.isFinite(+p.lng) && +p.lng >= -180 && +p.lng <= 180; }
  function clamp(n,a,b) {return Math.max(a, Math.min(b,n));}
  function defenseHours(g) {
    const values = (g.history || []).map(h => Number(h.hours)).filter(v => Number.isFinite(v) && v >= 0 && v < 365*24);
    if (!values.length) return BASE_HOURS[clamp(Number(g.popularity) || 3, 1, 5)];
    values.sort((a,b)=>a-b);
    const med = values[Math.floor(values.length / 2)];
    const priorWeight = 2;
    return (priorWeight*BASE_HOURS[clamp(Number(g.popularity)||3,1,5)] + values.length*med) / (priorWeight+values.length);
  }
  function gymValue(g, options = {}) {
    const hours = defenseHours(g);
    // A heuristic, not a predictive probability or guaranteed coin amount.
    const coinPotential = Math.min(1, hours / (8+1/3));
    const returnWindow = hours < 8 ? 0.40 + 0.60*hours/8 : hours <= 36 ? 1 : hours <= 72 ? 1 - (hours-36)/90 : Math.max(0.2, 0.6*72/hours);
    const pop = clamp(Number(g.popularity)||3,1,5);
    const quietPreference = options.quietPreference === false ? 1 : (1.12-(pop-1)*0.06);
    const access = g.status === 'enemy' ? 0.88 : 1;
    const confidence = Math.min(1, (g.history||[]).length/8);
    return Math.round(100*coinPotential*returnWindow*quietPreference*access*(0.93+0.07*confidence));
  }
  function inRadius(gyms, start, radiusKm, options={}) {
    if (!isCoord(start)) return [];
    return gyms.filter(g => isCoord(g) && haversine(start,g) <= radiusKm &&
      g.status !== 'mine' && g.status !== 'full' && g.status !== 'unavailable' &&
      (!options.avoidBusy || Number(g.popularity || 3) <= 3));
  }
  const DETOUR = {walk:1.35,bike:1.32,car:1.55};
  function plan(gyms,start,options) {
    const mode = options.mode in DETOUR ? options.mode : 'walk';
    const factor = DETOUR[mode], radiusKm = Number(options.radiusKm), maxKm=Number(options.maxKm);
    const count = Math.max(1,Math.min(12,Number(options.maxStops)||4));
    const roundtrip = options.roundtrip !== false;
    if (!isCoord(start) || !(radiusKm>0) || !(maxKm>0)) return {stops:[], estimateKm:0, error:'Ustaw punkt startowy, promień i maksymalną długość trasy.'};
    const pool = inRadius(gyms,start,radiusKm,options).map(g=>({...g, value:gymValue(g,options)}));
    let current=start, estimateKm=0, stops=[], remaining=pool;
    while(stops.length<count && remaining.length) {
      let best=null, utility=-Infinity, addedDistance=0;
      for(const g of remaining){
        const leg=haversine(current,g)*factor;
        const closing=roundtrip?haversine(g,start)*factor:0;
        if(estimateKm+leg+closing>maxKm) continue;
        const increment=leg+(roundtrip?Math.max(0,closing-haversine(current,start)*factor):0);
        const candidate=g.value/Math.pow(Math.max(0.15,increment),0.75);
        if(candidate>utility) {best=g;utility=candidate;addedDistance=leg;}
      }
      if(!best) break;
      stops.push(best);
      estimateKm+=addedDistance;current=best;
      remaining=remaining.filter(g=>g.id!==best.id);
    }
    if(roundtrip && stops.length) estimateKm+=haversine(current,start)*factor;
    return {stops,estimateKm,eligible:pool.length, mode, roundtrip};
  }
  function decodePolyline6(str){
    let i=0, lat=0, lng=0, coordinates=[];
    while(i<str.length){
      let b, shift=0,result=0;
      do {b=str.charCodeAt(i++)-63;result|=(b&0x1f)<<shift;shift+=5;} while(b>=0x20 && i<=str.length);
      lat+=(result&1)?~(result>>1):(result>>1);
      shift=0;result=0;
      do {b=str.charCodeAt(i++)-63;result|=(b&0x1f)<<shift;shift+=5;} while(b>=0x20 && i<=str.length);
      lng+=(result&1)?~(result>>1):(result>>1);
      coordinates.push([lat/1e6,lng/1e6]);
    }
    return coordinates;
  }
  return {haversine,isCoord,clamp,defenseHours,gymValue,inRadius,plan,decodePolyline6};
});