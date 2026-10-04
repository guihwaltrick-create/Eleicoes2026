# Eleições 2026 — Painel de apuração e projeção

Painel independente criado por **Guilherme Waltrick · GW Soluções Digitais**, com dados públicos do Tribunal Superior Eleitoral.

## Recursos

- Apuração nacional e dos 27 estados/DF para presidente.
- Votos e percentuais de Lula, Flávio Bolsonaro e demais candidatos.
- Estados agrupados por liderança, com totais e percentuais ponderados.
- Visualização compacta para celular e tabela completa opcional.
- Projeção matemática por UF e comparação com a tendência nacional.
- Data e hora do arquivo do TSE com tempo decorrido.
- Atualização automática a cada minuto; cache no servidor de 30 segundos.

## Executar localmente

Instale Node.js 22 ou superior. O projeto não possui dependências externas.

```bash
npm start
```

Abra http://localhost:3000. A porta pode ser definida pela variável de ambiente `PORT`.

## API

- `GET /api/resultados`: Brasil e 27 UFs normalizados.
- `GET /api/raw?uf=br`: arquivo nacional original.
- `GET /api/raw?uf=ac`: arquivo original de uma UF.

Fonte: https://resultados.tse.jus.br/oficial/ele2026/6257/dados/{uf}/{uf}-c0001-e006257-u.json

As fotos dos candidatos são fornecidas pelo TSE. A marca GW Soluções Digitais identifica o criador do painel.

## Projeções

Os votos restantes são estimados pela fração de seções totalizadas em cada UF, mantendo a distribuição atual dos candidatos. A estimativa não possui margem de confiança e não constitui previsão oficial de vencedor. Consulte as premissas na aba Projeção.

## Hospedagem

O projeto utiliza um servidor Node.js para consultar o TSE. GitHub Pages sozinho não executa esse servidor. Para publicar o site, configure uma hospedagem compatível com Node.js.

## Contato

Guilherme Waltrick — (49) 99907-0882

Projeto independente, sem vínculo com a Justiça Eleitoral.
