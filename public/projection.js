(function(root) {
  function project(data) {
    const b = data.brasil;
    if (!b || b.validos <= 0) return null;
    const states = data.estados.map(s => {
      const fraction = s.secoesTotal > 0 ? s.secoesTotalizadas / s.secoesTotal : 0;
      const available = fraction > 0 && fraction <= 1 && s.validos > 0;
      const factor = available ? 1 / fraction : 1;
      return {...s, available, finalValidos: s.validos * factor,
        restante: s.validos * (factor - 1),
        finalLula: s.lula.votos * factor, finalFlavio: s.flavio.votos * factor};
    });
    // Mantém o total BR como base: diferenças de horário e exterior não são somados duas vezes.
    const remaining = states.reduce((a,s) => a + s.restante, 0);
    const total = b.validos + remaining;
    const lula = b.lula.votos + states.reduce((a,s) => a + s.finalLula - s.lula.votos, 0);
    const flavio = b.flavio.votos + states.reduce((a,s) => a + s.finalFlavio - s.flavio.votos, 0);
    const nationalFraction = b.secoesTotal > 0 ? b.secoesTotalizadas / b.secoesTotal : 0;
    const demais = Math.max(0, total - lula - flavio);
    return {states, total, remaining, lula, flavio, demais, demaisPct: demais / total * 100,
      lulaPct: lula / total * 100, flavioPct: flavio / total * 100,
      nationalTotal: nationalFraction > 0 ? b.validos / nationalFraction : null,
      incomplete: states.length !== 27 || states.some(s => !s.available),
      currentLulaPct: b.lula.votos / b.validos * 100,
      currentFlavioPct: b.flavio.votos / b.validos * 100};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = project;
  else root.projectResults = project;
})(typeof globalThis !== 'undefined' ? globalThis : this);
