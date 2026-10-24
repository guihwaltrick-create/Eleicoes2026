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
