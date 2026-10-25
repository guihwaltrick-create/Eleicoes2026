const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createMapService,STATE_IDS}=require('../map-data');
const {createResultCache}=require('../result-cache');
const {normalize}=require('../server');
const catalog={abr:[{cd:'ac',ds:'ACRE',mu:[{cd:'01120',cdi:'1200013',nm:'Acrelândia'},{cd:'01570',cdi:'1200054',nm:'Assis Brasil'}]}]};
const voted={dt:'25/10/2026',ht:'17:01:00',s:{ts:'10',st:'5',pst:'50,00'},v:{vvc:'100'},carg:[{cd:'1',agr:[{par:[{cand:[{nmu:'LULA',vap:'40',pvap:'40,00'},{nmu:'FLAVIO BOLSONARO',vap:'60',pvap:'60,00'}]}]}]}]};
test('rótulos abrangem os 27 estados/DF e a malha nacional mantém códigos municipais únicos',()=>{
 const labels=JSON.parse(fs.readFileSync('public/map-state-labels.json','utf8'));
 assert.equal(labels.length,27);assert.deepEqual(labels.map(l=>l.uf).sort(),Object.keys(STATE_IDS).map(s=>s.toUpperCase()).sort());
 assert.ok(labels.every(l=>l.nome&&l.coordinates.length===2&&l.coordinates.every(Number.isFinite)));
 const shape=JSON.parse(fs.readFileSync('public/br-cidades.geojson','utf8'));
 assert.ok(shape.features.length>5500);assert.equal(new Set(shape.features.map(f=>String(f.properties.id))).size,shape.features.length);
});
test('visão nacional usa acompanhamento oficial para municípios ainda sem seções apuradas',async()=>{
 const requests=[];
 const service=createMapService({normalize,fetchJSON:async url=>{
  requests.push(url);
  if(url.includes('/config/'))return catalog;
  if(url.endsWith('-ab.json'))return {dg:'25/10/2026',hg:'16:00:00',abr:[{tpabr:'mun',cdabr:'01120',s:{ts:'10',st:'0',pst:'0,00'}},{tpabr:'mun',cdabr:'01570',dt:voted.dt,ht:voted.ht,s:voted.s}]};
  assert.match(url,/ac01570-c0001-e006258-u.json$/);return voted;
 }});
 const data=await service.municipalities('ac',0,2,{national:true});
 assert.equal(data.municipios[0].aguardandoApuracao,true);assert.equal(data.municipios[0].validos,0);assert.equal(data.municipios[0].secoesTotal,10);
 assert.equal(data.municipios[1].flavio.votos,60);assert.equal(data.errors.length,0);assert.equal(requests.filter(url=>url.endsWith('-u.json')).length,1);
});
test('falha do acompanhamento não produz zeros artificiais e consulta os arquivos municipais',async()=>{
 const service=createMapService({normalize,fetchJSON:async url=>{
  if(url.includes('/config/'))return catalog;
  if(url.endsWith('-ab.json'))throw new Error('HTTP 503');
  return voted;
 }});
 const data=await service.municipalities('ac',0,2,{national:true});assert.ok(data.municipios.every(m=>m.validos===100&&!m.aguardandoApuracao));
});
test('reutiliza arquivo municipal com horário confirmado e recarrega ao mudar a versão',async t=>{
 let now=1,files=0,stamp='17:01:00';t.mock.method(Date,'now',()=>now);
 const service=createMapService({normalize,resultCache:createResultCache({now:()=>now}),fetchJSON:async url=>{
  if(url.includes('/config/'))return {abr:[{...catalog.abr[0],mu:[catalog.abr[0].mu[0]]}]};
  if(url.endsWith('-ab.json'))return {abr:[{tpabr:'mun',cdabr:'01120',dt:'25/10/2026',ht:stamp,s:voted.s}]};
  files++;return {...voted,ht:stamp};
 }});
 await service.municipalities('ac',0,2,{national:true});now+=31000;
 await service.municipalities('ac',0,2,{national:true});assert.equal(files,1);
 stamp='17:02:00';now+=31000;await service.municipalities('ac',0,2,{national:true});assert.equal(files,2);
});
test('não congela versão se o arquivo de resultado ainda não alcançou o horário do índice',async()=>{
 let now=1,files=0;
 const service=createMapService({normalize,resultCache:createResultCache({now:()=>now}),fetchJSON:async url=>{
  if(url.includes('/config/'))return {abr:[{...catalog.abr[0],mu:[catalog.abr[0].mu[0]]}]};
  if(url.endsWith('-ab.json'))return {abr:[{tpabr:'mun',cdabr:'01120',dt:'25/10/2026',ht:'17:02:00',s:voted.s}]};
  files++;return voted;
 }});
 await service.municipalities('ac',0,2,{national:true});now+=31000;await service.municipalities('ac',0,2,{national:true});assert.equal(files,2);
});
