function electionFor(turn = '2') {
  if (!['1','2'].includes(String(turn))) throw new Error('Turno inválido: use 1 ou 2');
  const turno = Number(turn), codigo = turno === 1 ? '6257' : '6258';
  return {turno, codigo, arquivo:codigo.padStart(6,'0'), root:`https://resultados.tse.jus.br/oficial/ele2026/${codigo}`};
}
module.exports = {electionFor};
