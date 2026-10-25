const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createExteriorService} = require('../exterior-data');
const aggregate = require('../public/exterior-model');
const locations = require('../data/exterior-localidades.json').localidades;
const fs = require('node:fs');

const normalize = (raw, uf) => ({uf:uf.toUpperCase(), validos:Number(raw.v.vvc),
  secoesTotal:Number(raw.s.ts), secoesTotalizadas:Number(raw.s.st),
  secoesPct:Number(raw.s.st)/Number(raw.s.ts)*100,
  lula:{votos:raw.lula || 0}, flavio:{votos:raw.flavio || 0}, atualizadoEm:'25/10/2026 17:00:00'});
const raw = {v:{vvc:'100'}, s:{ts:'10', st:'5'}, lula:60, flavio:40};
const memoryCache = () => {
  const values = new Map();
  return async (key, ttl, load, {complete = () => true} = {}) => {
    if (values.has(key)) return values.get(key);
    const data = await load();if (complete(data)) values.set(key, data);return data;
  };
};

test('agrega votos e seções por país sem tirar média de percentuais', () => {
  const a = {...normalize({...raw, s:{ts:'10', st:'10'}, lula:90, flavio:10}, 'zz'), codigo:'1'};
  const b = {...normalize({...raw, v:{vvc:'900'}, s:{ts:'90', st:'45'}, lula:10, flavio:890}, 'zz'), codigo:'2'};
  const [country] = aggregate([{id:'US', nome:'Estados Unidos', localidades:['1','2']}], [a,b]);
  assert.equal(country.validos, 1000);assert.equal(country.lula.percentual, 10);
  assert.equal(country.flavio.percentual, 90);assert.ok(Math.abs(country.secoesPct-55)<1e-9);
  assert.equal(country.parcial, false);assert.equal(country.indisponivel, false);
});

test('consulta ausente ou falha gera parcial; país sem dados não vira zero confirmado', () => {
  const catalog = [{id:'US', nome:'Estados Unidos', localidades:['1','2']}, {id:'PT', nome:'Portugal', localidades:['3']}];
  const [us,pt] = aggregate(catalog, [{...normalize(raw,'zz'), codigo:'1'}, {codigo:'2',indisponivel:true}]);
  assert.equal(us.parcial,true);assert.equal(us.locaisRecebidos,1);assert.equal(us.locaisTotal,2);
  assert.equal(pt.indisponivel,true);assert.equal(pt.parcial,true);
  assert.equal(aggregate([catalog[0]], [{...normalize(raw,'zz'),codigo:'1',desatualizado:true},{...normalize(raw,'zz'),codigo:'2'}])[0].parcial,true);
});

test('catálogo estático associa todas as localidades conhecidas a países presentes no mapa', () => {
  const world = JSON.parse(fs.readFileSync(require.resolve('../public/world-countries.geojson'),'utf8'));
  const ids = world.features.map(f => f.properties.id);
  assert.equal(new Set(ids).size, ids.length);assert.equal(Object.keys(locations).length,186);
  for (const city of Object.values(locations)) assert.ok(ids.includes(city.pais), city.nome);
  assert.equal(locations['29793'].pais,'CN');assert.equal(locations['29475'].pais,'FR');
  assert.equal(locations['29955'].pais,'PT');assert.equal(locations['30228'].pais,'US');
});

test('exterior consulta só ZZ, mantém total oficial e isola caches por turno', async () => {
  const calls = [];
  const service = createExteriorService({normalize, resultCache:memoryCache(), locations:{'00001':{pais:'US'}, '00002':{pais:'PT'}}, fetchJSON:async url => {
    calls.push(url);
    if (url.includes('/config/')) return {abr:[{cd:'zz', mu:[{cd:'1',nm:'Nova York'},{cd:'2',nm:'Lisboa'}]}]};
    if (url.endsWith('-ab.json')) throw new Error('indisponível');
    return raw;
  }});
  const first = await service.page(0,'1');
  assert.equal(first.localidades.length,2);assert.equal(first.paises.length,2);
  assert.equal(first.resumo.validos,100); // Não soma as duas localidades no total oficial.
  assert.equal(first.localidades[0].pais,'US');assert.ok(calls.some(url => url.includes('/zz/zz00001-c0001-e006257-u.json')));
  const before = calls.length;await service.page(0,'1');assert.equal(calls.length,before);
  await service.page(0,'2');assert.ok(calls.some(url => url.includes('e006258')));
});

test('acompanhamento oficial confirma zeros sem consultar cada localidade; falhas não viram votos', async () => {
  const calls=[];
  const service=createExteriorService({normalize,resultCache:memoryCache(),locations:{'00001':{pais:'US'}},fetchJSON:async url=>{
    calls.push(url);
    if(url.includes('/config/'))return {abr:[{cd:'zz',mu:[{cd:'1',nm:'Nova York'},{cd:'2',nm:'Local novo'}]}]};
    if(url.endsWith('-ab.json'))return {dg:'25/10/2026',hg:'17:00:00',abr:[{tpabr:'mun',cdabr:'1',s:{ts:'10',st:'0'}}]};
    if(url.includes('zz00002'))throw Error('HTTP 404');
    return raw;
  }});
  const data=await service.page();
  assert.equal(data.localidades[0].validos,0);assert.equal(data.localidades[1].indisponivel,true);
  assert.equal(data.localidades[1].pais,'XX');assert.equal(data.errors.length,1);
  assert.equal(calls.some(url=>url.includes('zz00001')),false);
});

test('paginação de 50 localidades não repete nem omite registros', async () => {
  const cities=Array.from({length:51},(_,i)=>({cd:String(i+1),nm:'Local '+i}));
  const service=createExteriorService({normalize,resultCache:memoryCache(),fetchJSON:async url=>{
    if(url.includes('/config/'))return {abr:[{cd:'zz',mu:cities}]};
    if(url.endsWith('-ab.json'))throw Error('indisponível');return raw;
  }});
  const a=await service.page(0),b=await service.page(1);
  assert.equal(a.paginas,2);assert.equal(a.localidades.length,50);assert.equal(b.localidades.length,1);
  assert.equal(new Set([...a.localidades,...b.localidades].map(r=>r.codigo)).size,51);
});
