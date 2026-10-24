const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {electionFor}=require('../elections');
const {createResultCache}=require('../result-cache');
const {createMapService}=require('../map-data');
test('usa segundo turno por padrão e constrói identificadores dos dois turnos',()=>{
 assert.equal(electionFor().codigo,'6258');assert.equal(electionFor(1).arquivo,'006257');assert.equal(electionFor(2).arquivo,'006258');
 for(const value of ['0','3','01','constructor',''])assert.throws(()=>electionFor(value),/inválido/);
});
test('primeiro turno persiste entre instâncias e segundo turno expira',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'election-cache-'));let time=0,calls=0;
 const load=async()=>({sequence:++calls});
 try{
  const a=createResultCache({directory,now:()=>time});
  const first=await a('turn1',Infinity,load,{persist:true});time=86400000;
  assert.deepEqual(await a('turn1',Infinity,load,{persist:true}),first);
  const b=createResultCache({directory,now:()=>time});assert.deepEqual(await b('turn1',Infinity,load,{persist:true}),first);assert.equal(calls,1);
  await b('turn2',30000,load);await b('turn2',30000,load);assert.equal(calls,2);
  time+=30001;await b('turn2',30000,load);assert.equal(calls,3);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('compartilha requisições concorrentes e não congela resultados incompletos',async()=>{
 const cached=createResultCache();let calls=0;
 const load=async()=>{calls++;await new Promise(r=>setImmediate(r));return {errors:['falha']};};
 const options={complete:data=>!data.errors.length};
 await Promise.all([cached('partial',Infinity,load,options),cached('partial',Infinity,load,options)]);assert.equal(calls,1);
 await cached('partial',Infinity,load,options);assert.equal(calls,2);
});
test('isola resultados e catálogos municipais por turno e reutiliza o primeiro após reinício',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'municipal-turns-'));let time=0;const requests=[];
 const fetchJSON=async url=>{
  requests.push(url);
  if(url.includes('/config/'))return {abr:[{cd:'ac',ds:'ACRE',mu:[{cd:'01120',cdi:'1200013',nm:'Acrelândia'}]}]};
  return {ele:url.includes('/6257/')?'6257':'6258'};
 };
 const normalize=raw=>({eleicao:raw.ele});
 const create=()=>createMapService({fetchJSON,normalize,resultCache:createResultCache({directory,now:()=>time})});
 try{
  const a=create();const first=await a.municipalities('ac',0,1),second=await a.municipalities('ac',0,2);
  assert.equal(first.municipios[0].eleicao,'6257');assert.equal(second.municipios[0].eleicao,'6258');assert.equal(requests.length,4);
  assert.ok(requests.some(url=>url.includes('mun-e006257-cm.json')));assert.ok(requests.some(url=>url.includes('ac01120-c0001-e006258-u.json')));
  time=60000;await a.municipalities('ac',0,1);assert.equal(requests.length,4);
  await a.municipalities('ac',0,2);assert.equal(requests.length,5);
  await create().municipalities('ac',0,1);assert.equal(requests.length,5);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
