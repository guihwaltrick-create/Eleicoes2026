# Limites estaduais alternativos

`estados.geojson`: cópia de `brazil-states.geojson` do projeto Click That Hood,
com propriedades reduzidas para código IBGE e nome. Coordenadas preservadas.

- Origem: https://github.com/codeforamerica/click_that_hood/blob/master/public/data/brazil-states.geojson
- Fonte indicada pelo acervo: CodeGeo, http://www.codegeo.com.br/2013/04/shapefiles-do-brasil-para-download.html
- Licença do repositório: MIT, preservada em `estados-LICENSE.txt`.

A API consulta primeiro a malha do IBGE. Este arquivo é usado quando ela não
responde. Para municípios, o acervo alternativo é Geodata BR (IBGE, CC0):
https://github.com/tbrugz/geodata-br. Seus limites podem ser anteriores à
configuração eleitoral; cidades sem geometria continuam disponíveis na lista.

## Contexto geográfico do mapa

`public/map-context.geojson`: países da América do Sul extraídos da malha
Natural Earth 1:110m, com propriedades reduzidas ao nome em português.

- Origem: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
- Natural Earth: https://www.naturalearthdata.com/about/terms-of-use/ (domínio público).

Usado somente para o fundo geográfico; as cores eleitorais usam as malhas do
IBGE e os resultados atuais do TSE.

## Visão Brasil · Cidades

`public/br-cidades.geojson`: malha municipal Geodata BR (IBGE, CC0), obtida de
https://github.com/tbrugz/geodata-br/blob/master/geojson/geojs-100-mun.json.
Simplificada com Mapshaper (10%, keep-shapes, precisão 0.001) para uso nacional.
A malha contém 5.564 registros; geometrias ausentes são omitidas na renderização.
O catálogo atual do TSE é a referência dos municípios: aqueles sem geometria
continuam disponíveis na lista e são contabilizados na mensagem do mapa.

`public/map-state-labels.json`: nomes e pontos interiores derivados da malha
`data/estados.geojson`, com Mapshaper `-points inner`, para os 27 estados/DF.
