(function(root) {
  function aggregateCountries(catalog, localities) {
    const rows = new Map(localities.map(row => [row.codigo, row]));
    return catalog.map(country => {
      const received = country.localidades.map(id => rows.get(id)).filter(row => row && !row.indisponivel);
      const sum = key => received.reduce((total, row) => total + row[key], 0);
      const validos = sum('validos'), secoesTotal = sum('secoesTotal'), secoesTotalizadas = sum('secoesTotalizadas');
      const candidate = key => {
        const votos = received.reduce((total, row) => total + row[key].votos, 0);
        return {votos, percentual:validos ? votos/validos*100 : 0};
      };
      // Nenhuma média de percentuais: votos e seções são somados antes do cálculo.
      const timestamps = received.map(row => row.atualizadoEm).filter(Boolean);
      const dateValue = stamp => {
        const [date, time] = stamp.split(' ');return date.split('/').reverse().join('-') + 'T' + time;
      };
      timestamps.sort((a,b) => dateValue(a).localeCompare(dateValue(b)));
      return {ibge:country.id, uf:country.id, nome:country.nome, validos, secoesTotal, secoesTotalizadas,
        secoesPct:secoesTotal ? secoesTotalizadas/secoesTotal*100 : 0,
        lula:candidate('lula'), flavio:candidate('flavio'),
        locaisRecebidos:received.length, locaisTotal:country.localidades.length,
        parcial:received.length !== country.localidades.length || received.some(row => row.desatualizado),
        desatualizado:received.some(row => row.desatualizado),
        indisponivel:received.length === 0, atualizadoEm:timestamps[0] || null};
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = aggregateCountries;
  else root.aggregateCountryResults = aggregateCountries;
})(typeof globalThis !== 'undefined' ? globalThis : this);
