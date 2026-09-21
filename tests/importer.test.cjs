const test=require('node:test'),assert=require('node:assert/strict');
const {parseText,withinRadius,sourceUrl}=require('../importer.js');
test('Parses Polish semicolon list and filters geographical radius',()=>{
 const parsed=parseText('Rynek; 53.1325; 23.1688\nDaleko; 52.23; 21.01');
 assert.equal(parsed.gyms.length,2);
 assert.equal(withinRadius(parsed.gyms,{lat:53.1325,lng:23.1688},2).length,1);
});
test('Parses comma CSV, filters other types, and accepts quoted commas',()=>{
 const parsed=parseText('name,lat,lng,type\n"Park, duży",53.1,23.1,Gym\nStop,53.1,23.2,Pokestop');
 assert.equal(parsed.gyms.length,1);assert.equal(parsed.gyms[0].name,'Park, duży');
});
test('GeoJSON accepts only explicitly gym-tagged points',()=>{
 const p=parseText(JSON.stringify({type:'FeatureCollection',features:[
 {type:'Feature',properties:{name:'Gym A',type:'Gym'},geometry:{type:'Point',coordinates:[23.1,53.1]}},
 {type:'Feature',properties:{name:'Wayspot'},geometry:{type:'Point',coordinates:[23.2,53.2]}}]}));
 assert.equal(p.gyms.length,1);assert.equal(p.skipped,1);
});
test('Rejects invalid coordinates and HTML instead of inventing gyms',()=>{
 assert.equal(parseText('name;lat;lng\nA;999;23.1').gyms.length,0);
 assert.throws(()=>parseText('<!DOCTYPE html>'),/Wymagane kolumny/);
});
test('Expands optional radius URL placeholders and rejects insecure URL',()=>{
 assert.equal(sourceUrl('https://example.org/api?lat={lat}&lng={lng}&r={radiusKm}',{lat:53,lng:23},5),'https://example.org/api?lat=53&lng=23&r=5');
 assert.throws(()=>sourceUrl('http://example.org/gyms.csv',{lat:53,lng:23},5),/HTTPS/);
});
