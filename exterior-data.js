const {electionFor} = require('./elections');
const {createResultCache} = require('./result-cache');
const mapping = require('./data/exterior-localidades.json').localidades;

function createExteriorService({fetchJSON, normalize, resultCache = createResultCache(), locations = mapping}) {
  const names = new Intl.DisplayNames('pt-BR', {type:'region'});
  async function catalog(turn) {
    const e = electionFor(turn);
    return resultCache('exterior-catalog-v1:' + e.codigo, e.turno === 1 ? Infinity : 86400000, async () => {
      const raw = await fetchJSON(`${e.root}/config/mun-e${e.arquivo}-cm.json`, true);
      const state = raw.abr?.find(s => s.cd === 'zz');
      if (!Array.isArray(state?.mu)) throw new Error('Catálogo do exterior indisponível');
      const localidades = state.mu.map(city => {
        const codigo = String(city.cd).padStart(5, '0');
        return {codigo, nome:city.nm, pais:locations[codigo]?.pais || 'XX'};
      });
      const paises = [...new Set(localidades.map(city => city.pais))].map(id => ({
        id, nome:id === 'XX' ? 'País não identificado' : names.of(id),
        localidades:localidades.filter(city => city.pais === id).map(city => city.codigo)
      })).sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return {localidades, paises};
    }, {persist:e.turno === 1});
  }
  async function page(page = 0, turn = '2') {
    const e = electionFor(turn), ttl = e.turno === 1 ? Infinity : 30000;
    return resultCache(`exterior-page-v1:${e.codigo}:${page}`, ttl, async () => {
      const data = await catalog(turn);
      const resumo = await resultCache('exterior-total:' + e.codigo, ttl, async () =>
        normalize(await fetchJSON(`${e.root}/dados/zz/zz-c0001-e${e.arquivo}-u.json`, true), 'zz'), {persist:e.turno === 1});
      const index = await resultCache('exterior-progress:' + e.codigo, ttl, async () => {
        const raw = await fetchJSON(`${e.root}/dados/zz/zz-e${e.arquivo}-ab.json`, true);
        if (!Array.isArray(raw.abr)) throw new Error('Acompanhamento do exterior indisponível');
        return {raw, entries:new Map(raw.abr.filter(r => r.tpabr === 'mun').map(r => [String(r.cdabr).padStart(5,'0'), r]))};
      }).catch(() => null);
      const pageSize = 50, targets = data.localidades.slice(page * pageSize, (page + 1) * pageSize);
      const localidades = new Array(targets.length), errors = [];
      let next = 0;
      await Promise.all(Array.from({length:Math.min(6, targets.length)}, async () => {
        while (next < targets.length) {
          const i = next++, city = targets[i];
          try {
            const progress = index?.entries.get(city.codigo);
            const raw = progress?.s?.st === '0' && Number(progress.s.ts) > 0
              ? {s:progress.s, v:{vvc:'0'}, dg:index.raw.dg, hg:index.raw.hg}
              : await fetchJSON(`${e.root}/dados/zz/zz${city.codigo}-c0001-e${e.arquivo}-u.json`, true);
            localidades[i] = {...normalize(raw, 'zz'), ...city};
          } catch (error) {
            localidades[i] = {...city, indisponivel:true};
            errors.push(city.nome + ': ' + error.message);
          }
        }
      }));
      return {turno:e.turno, resumo, paises:data.paises, localidades, total:data.localidades.length,
        pagina:page, paginas:Math.ceil(data.localidades.length/pageSize), errors};
    }, {persist:e.turno === 1, complete:data => e.turno === 2 || data.errors.length === 0});
  }
  return {catalog, page};
}

module.exports = {createExteriorService};
