const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createMapService} = require('../map-data');
const {normalize,server} = require('../server');
const raw = {dg:'24/10/2026',hg:'10:00:00',s:{st:'8',ts:'10',pst:'80,00'},v:{vvc:'100'},carg:[{cd:'1',agr:[{par:[{cand:[{nmu:'LULA',vap:'60',pvap:'60,00'},{nmu:'FLAVIO BOLSONARO',vap:'30',pvap:'30,00'}]}]}]}]};
const catalog = {abr:[{cd:'ac',ds:'ACRE',mu:[{cd:'1120',cdi:'1200013',nm:'ACRELÂNDIA'},{cd:'01570',cdi:'1200054',nm:'ASSIS BRASIL'}]},{cd:'zz',ds:'EXTERIOR',mu:[]}]};
test('exporta uma função HTTP para a Vercel sem iniciar uma porta ao importar',()=>{
 const handler=require('../server');assert.equal(typeof handler,'function');assert.strictEqual(handler,server.listeners('request')[0]);assert.equal(server.listening,false);
});
test('normaliza a estrutura EA20 municipal e mantém os votos de cada candidato',()=>{
 const row=normalize(raw,'ac');assert.equal(row.lula.votos,60);assert.equal(row.flavio.percentual,30);assert.equal(row.secoesPct,80);assert.equal(row.validos,100);
});
test('liga códigos TSE com zeros aos códigos IBGE; compartilha consultas e cache',async()=>{
 const requests=[];
 const service=createMapService({normalize,fetchJSON:async url=>{requests.push(url);return url.includes('/config/')?catalog:raw;}});
 const [a,b]=await Promise.all([service.municipalities('ac'),service.municipalities('ac')]);
 assert.strictEqual(a,b);assert.equal(a.municipios[0].codigo,'01120');assert.equal(a.municipios[0].ibge,'1200013');assert.equal(a.municipios[0].lula.votos,60);
 assert.ok(requests.some(url=>url.endsWith('/ac/ac01120-c0001-e006258-u.json')));
 await service.municipalities('ac');assert.equal(requests.length,3);assert.equal((await service.catalog()).length,1);
});
test('preserva cidades indisponíveis e informa a falha sem atribuir votos',async()=>{
 const service=createMapService({normalize,fetchJSON:async url=>{if(url.includes('/config/'))return catalog;if(url.includes('01570'))throw new Error('HTTP 404');return raw;}});
 const data=await service.municipalities('ac');assert.equal(data.errors.length,1);assert.equal(data.municipios.length,2);assert.equal(data.municipios[1].indisponivel,true);assert.equal(data.municipios[1].lula,undefined);
});
test('divide UFs grandes em páginas de até 100 municípios sem duplicação',async()=>{
 const list=Array.from({length:205},(_,i)=>({cd:String(i),cdi:String(1200000+i),nm:'Cidade '+i}));
 const service=createMapService({normalize,fetchJSON:async url=>url.includes('/config/')?{abr:[{cd:'ac',ds:'ACRE',mu:list}]}:raw});
 const pages=await Promise.all([0,1,2].map(page=>service.municipalities('ac',page)));
 assert.deepEqual(pages.map(p=>p.municipios.length),[100,100,5]);assert.equal(pages[0].paginas,3);assert.equal(new Set(pages.flatMap(p=>p.municipios.map(c=>c.ibge))).size,205);
});
test('recorre ao acervo quando IBGE falha e normaliza os identificadores',async()=>{
 const service=createMapService({normalize,fetchJSON:async url=>{if(url.includes('ibge.gov.br'))throw new Error('timeout');return {features:[{type:'Feature',properties:{id:'1200013',name:'Acrelândia'},geometry:{type:'Polygon',coordinates:[]}}]};}});
 const data=await service.geometry('ac');assert.equal(data.features[0].properties.id,'1200013');assert.equal(data.features[0].properties.uf,'AC');assert.match(data.fonte,/Geodata BR/);
 const country=await service.geometry('br');assert.equal(country.features.length,27);assert.equal(new Set(country.features.map(f=>f.properties.uf)).size,27);
});
test('API rejeita UF e paginação inválidas e serve CSS com tipo correto',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const request=path=>new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port:server.address().port,path},res=>{res.resume();res.on('end',()=>resolve(res));}).on('error',reject));
 try {
  for(const path of ['/api/municipios','/api/municipios?uf=zz','/api/mapa?uf=constructor','/api/municipios?uf=ac&pagina=-1','/api/resultados?turno=3','/api/municipios?uf=ac&turno=01'])assert.equal((await request(path)).statusCode,400);
  assert.match((await request('/map.css')).headers['content-type'],/text\/css/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
