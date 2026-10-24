# Eleições 2026 — Painel de apuração e projeção

Painel independente criado por **Guilherme Waltrick · GW Soluções Digitais**, com dados públicos do Tribunal Superior Eleitoral.

## Recursos

- Apuração nacional e dos 27 estados/DF para presidente.
- Aba Mapa com estados e municípios: azul para Flávio à frente e vermelho para Lula.
- Busca por cidade, zoom e cartões ordenados por votos no local selecionado.
- Votos e percentuais de Lula, Flávio Bolsonaro e demais candidatos.
- Estados agrupados por liderança, com totais e percentuais ponderados.
- Visualização compacta para celular e tabela completa opcional.
- Projeção matemática por UF e comparação com a tendência nacional.
- Data e hora do arquivo do TSE com tempo decorrido.
- Seletor de 1º e 2º turno no início da tela, com 2º turno como padrão.
- Atualização automática somente do segundo turno, a cada minuto; cache de 30 segundos.
- Primeiro turno consultado uma única vez por recorte, com cache persistente.

## Executar localmente

Instale Node.js 22 ou superior. O projeto não possui dependências externas.

```bash
npm start
```

Abra http://localhost:3000. A porta pode ser definida pela variável de ambiente `PORT`.

## Turnos e cache

A página sempre abre no **2º turno** (eleição 6258). O seletor no início altera
apuração, projeção, estados e municípios em conjunto. O 1º turno (6257) é consultado
somente na primeira seleção; os municípios são consultados na primeira abertura
de cada UF. Resultados completos do primeiro turno ficam salvos no navegador e em
`.cache/primeiro-turno/` no servidor, inclusive após reiniciar o processo. Falhas ou
respostas parciais podem ser consultadas novamente para completar os dados.

O intervalo de um minuto consulta somente o segundo turno, mesmo enquanto o
primeiro está selecionado, sem alterar a visualização. Voltar ao primeiro turno ou
clicar em Atualizar reaproveita seu cache. A geografia é compartilhada pelos turnos.

## API

Os endpoints de resultados aceitam `turno=1` ou `turno=2` (padrão). Exemplos:
`/api/resultados?turno=1` e `/api/municipios?uf=ac&pagina=0&turno=2`.
As respostas normalizadas incluem `turno` e `eleicao`. Caches e requisições em andamento são
separados por turno para impedir mistura de resultados.

- `GET /api/resultados`: Brasil e 27 UFs normalizados.
- `GET /api/municipios?uf=ac`: resultados de todos os municípios da UF, com códigos TSE e IBGE.
- `GET /api/municipios?uf=ac&pagina=0`: lote de até 100 municípios (páginas a partir de zero); a interface usa essa opção para UFs grandes.
- `GET /api/mapa?uf=br`: limites dos estados em GeoJSON.
- `GET /api/mapa?uf=ac`: limites dos municípios da UF em GeoJSON.
- `GET /api/raw?uf=br`: arquivo nacional original.
- `GET /api/raw?uf=ac`: arquivo original de uma UF.

Fonte (2º turno): https://resultados.tse.jus.br/oficial/ele2026/6258/dados/{uf}/{uf}-c0001-e006258-u.json

No 1º turno, o diretório é `6257` e o sufixo do arquivo é `e006257`.

As fotos dos candidatos são fornecidas pelo TSE. A marca GW Soluções Digitais identifica o criador do painel.

## Mapa e municípios

Abra a aba **Mapa** e selecione um estado no mapa ou no seletor. Clique em uma
cidade, ou busque seu nome na lista, para consultar os cartões de votação local.
O mapa usa fundo escuro com contexto geográfico, resumo dos candidatos à esquerda
e painel de estados à direita. Ao selecionar um estado, o painel lista suas cidades.
Em telas menores, os painéis são empilhados. A intensidade do azul/vermelho cresce
com o percentual de votos válidos do candidato que lidera no local (0% a 100%). Passe o
mouse, use o foco do teclado ou toque em um estado/cidade para abrir o popup
com apuração, votos, percentuais e vantagem atual. No celular, o popup do estado
oferece o botão **Ver municípios**.
As cores comparam Lula e Flávio; empate/sem votos e dados indisponíveis usam tons
neutros diferentes. Os demais candidatos continuam incluídos nos cartões.

O catálogo oficial `config/mun-e006258-cm.json` (2º turno) relaciona o código municipal TSE
(com cinco dígitos) ao código IBGE usado na geografia. Resultados municipais usam
`dados/{uf}/{uf}{codigoTSE}-c0001-e006258-u.json` no 2º turno. Municípios são carregados somente
para a UF selecionada, em lotes, com cache de 30 segundos no 2º turno (persistente
no 1º turno) e consultas simultâneas
limitadas. Requisições de resultados são espaçadas para respeitar o limite do TSE.
A tela atualiza os resultados do segundo turno a cada minuto. O total estadual vem do arquivo da UF,
sem somar arquivos municipais que podem ter horários de atualização distintos.

As malhas são consultadas no IBGE e armazenadas em cache por 24 horas. Se o IBGE
estiver indisponível, usamos acervos alternativos com a fonte indicada na tela;
consulte `data/README.md`. Limites alternativos podem ser anteriores ao catálogo:
cidades sem geometria continuam acessíveis na lista. Falhas no TSE são sinalizadas
por município, sem inventar votos ou liderança.

Documentação oficial: [TSE](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados) e [malhas IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3).

## Verificação

```bash
node --test
```

## Projeções

Os votos restantes são estimados pela fração de seções totalizadas em cada UF, mantendo a distribuição atual dos candidatos. A estimativa não possui margem de confiança e não constitui previsão oficial de vencedor. Consulte as premissas na aba Projeção.

## Hospedagem

O projeto utiliza um servidor Node.js para consultar o TSE. GitHub Pages sozinho não executa esse servidor. Para publicar o site, configure uma hospedagem compatível com Node.js.

## Contato

Guilherme Waltrick — (49) 99907-0882

Projeto independente, sem vínculo com a Justiça Eleitoral.
