const STATE_IDS = {ro:11,ac:12,am:13,rr:14,pa:15,ap:16,to:17,ma:21,pi:22,ce:23,rn:24,pb:25,pe:26,al:27,se:28,ba:29,mg:31,es:32,rj:33,sp:35,pr:41,sc:42,rs:43,ms:50,mt:51,go:52,df:53};
const {electionFor} = require('./elections');
const {createResultCache} = require('./result-cache');

function createMapService({fetchJSON, normalize, resultCache = createResultCache()}) {
  const cache = new Map(), pending = new Map();
  function cached(key, ttl, loader) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value);
    if (pending.has(key)) return pending.get(key);
    const request = loader().then(value => { cache.set(key, {at:Date.now(),value}); return value; }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }
  const catalog = (turn = '2') => {
    const election=electionFor(turn);
    return resultCache('catalog:'+election.codigo, election.turno===1?Infinity:86400000, async () => {
    const raw = await fetchJSON(`${election.root}/config/mun-e${election.arquivo}-cm.json`, true);
    if (!Array.isArray(raw.abr)) throw new Error('Catálogo de municípios do TSE inválido');
    return raw.abr.filter(s => Object.hasOwn(STATE_IDS,s.cd)).map(s => ({uf:s.cd, nome:s.ds, municipios:s.mu.map(m => ({codigo:String(m.cd).padStart(5,'0'),ibge:String(m.cdi),nome:m.nm}))}));
  },{persist:election.turno===1});
  };
  const municipalities = (uf, page = null, turn = '2') => {
    const election=electionFor(turn);
    return resultCache('municipal:'+election.codigo+':'+uf+':'+page, election.turno===1?Infinity:30000, async () => {
    const state = (await catalog(turn)).find(s => s.uf === uf);
    if (!state) throw new Error('UF ausente no catálogo do TSE');
    const pageSize = 100;
    const targets = page === null ? state.municipios : state.municipios.slice(page * pageSize, (page + 1) * pageSize);
    let next = 0;
    const results = new Array(targets.length), errors = [];
    // Um número limitado de trabalhadores evita milhares de consultas simultâneas.
    await Promise.all(Array.from({length:Math.min(8, targets.length)}, async () => {
      while (next < targets.length) {
        const index = next++, city = targets[index];
        try {
          const raw = await fetchJSON(`${election.root}/dados/${uf}/${uf}${city.codigo}-c0001-e${election.arquivo}-u.json`, true);
          results[index] = {...normalize(raw, uf), ...city};
        } catch (e) {
          results[index] = {...city, uf:uf.toUpperCase(), indisponivel:true};
          errors.push(`${city.nome}: ${e.message}`);
        }
      }
    }));
    return {turno:election.turno,eleicao:election.codigo,fonte:'TSE', uf:uf.toUpperCase(), nome:state.nome, coletadoEm:new Date().toISOString(), municipios:results, total:state.municipios.length, pagina:page, paginas:Math.ceil(state.municipios.length/pageSize), errors};
  },{persist:election.turno===1,complete:data=>election.turno===2||data.errors.length===0});
  };
  const geometry = uf => cached('geometry:'+uf, 86400000, async () => {
    const region = uf === 'br' ? 'paises/BR' : `estados/${STATE_IDS[uf]}`;
    const subdivision = uf === 'br' ? 'UF' : 'municipio';
    let raw, source = 'IBGE';
    try {
      raw = await fetchJSON(`https://servicodados.ibge.gov.br/api/v3/malhas/${region}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=${subdivision}`);
      if (!Array.isArray(raw.features) || !raw.features.length) throw new Error('Malha inválida');
    } catch (error) {
      source = uf === 'br' ? 'Acervo Click That Hood / CodeGeo' : 'IBGE · acervo Geodata BR (CC0)';
      raw = uf === 'br' ? JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'data/estados.geojson'), 'utf8')) : await fetchJSON(`https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-${STATE_IDS[uf]}-mun.json`);
    }
    if (!Array.isArray(raw.features) || !raw.features.length) throw new Error('Malha geográfica indisponível');
    return {type:'FeatureCollection', fonte:source, features:raw.features.map(f => {
      const p = f.properties;
      const id = String(p.codarea ?? p.id ?? f.id);
      const state = uf === 'br' ? Object.keys(STATE_IDS).find(s => String(STATE_IDS[s]) === id) : uf;
      return {...f, properties:{id,uf:state?.toUpperCase(),nome:p.name || p.nome || state?.toUpperCase() || id}};
    })};
  });
  return {catalog, municipalities, geometry};
}
module.exports = {createMapService, STATE_IDS};
