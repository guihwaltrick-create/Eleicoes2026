# Eleições 2026 — Painel de apuração e projeção

Painel independente criado por **Guilherme Waltrick · GW Soluções Digitais**, com dados públicos do Tribunal Superior Eleitoral.

## Recursos

- Apuração nacional e dos 27 estados/DF para presidente.
- Aba Mapa com estados e municípios: azul para Flávio à frente e vermelho para Lula.
- Visão Exterior no mapa mundial, com soma de votos por país, busca e popups.
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

## Visitantes online

O indicador no cabeçalho e no rodapé do mapa em tela cheia conta navegadores com
o site visível nos últimos 2 minutos. O navegador consulta `/api/online` a cada
30 segundos, pausa em abas ocultas e retoma ao voltar. Um cookie assinado,
`HttpOnly`, compartilhado entre abas identifica o navegador sem guardar nomes,
IP ou páginas visitadas no banco. Navegadores e dispositivos diferentes contam
separadamente. Registros expirados são removidos a cada consulta.

Para ativar:

1. Execute `supabase/migrations/202610250001_online_presence.sql` no SQL Editor
   do projeto Supabase. A migração cria somente a tabela
   `public.eleicoes2026_online_visitors`, seu índice e a função de presença.
2. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nas variáveis de
   ambiente do servidor. Localmente, copie `.env.example` para `.env`; o
   servidor carrega esse arquivo automaticamente. Na Vercel, configure as
   variáveis no projeto antes de publicar uma nova versão.
3. Abra o site e confira o indicador. `POST /api/online`, sem corpo, deve
   responder `{"online":1,"windowSeconds":120}` para o primeiro visitante.

A chave `service_role` deve permanecer apenas no servidor. O navegador recebe
somente a contagem. A tabela usa RLS e não concede acesso a `anon` ou
`authenticated`; apenas o servidor executa a função de presença. A integração
usa [funções de banco do Supabase](https://supabase.com/docs/guides/database/functions).
As chaves de API não substituem o acesso administrativo necessário para aplicar
SQL: use o SQL Editor, a conexão PostgreSQL ou a
[Management API com token administrativo](https://supabase.com/docs/reference/api/introduction).

Se o serviço estiver indisponível, o indicador mostra “Online indisponível”,
sem inventar uma contagem ou interferir na apuração.

## Administração, anúncios e informações

Acesse `/admin` ou o link **Administração** no rodapé. O login usa e-mail e senha
do Supabase Auth. Somente usuários com `app_metadata.eleicoes2026_admin = true`
(atribuição administrativa no Supabase) podem administrar este site; usuários
de outras aplicações do mesmo projeto não ganham acesso automaticamente.
Não há cadastro público de administradores.

O painel permite criar, editar, ativar/desativar, ordenar e excluir publicações.
Informações são somente texto; anúncios exigem um link HTTP(S), aberto em nova
aba. Publicações ativas são exibidas em uma única linha à direita do online,
com movimento da direita para a esquerda, inclusive no mapa em tela cheia.
A faixa pausa ao passar o mouse ou focar um link no computador. Em celulares,
tocar ou focar o anúncio não mantém a faixa pausada. Um botão permite pausar
ou retomar a rolagem; a escolha é mantida no navegador. Com movimento reduzido,
a rolagem usa uma velocidade mais lenta. Atualizações
aparecem em até cerca de 40 segundos (consulta a cada 30 segundos, cache de 10).

Execute também as migrações, após a tabela de presença:

1. `supabase/migrations/202610250002_announcements.sql` cria a tabela de publicações.
2. `supabase/migrations/202610250003_online_peak.sql` cria o histórico do pico e
   atualiza a função de presença existente.

As tabelas são privadas (RLS e privilégios revogados para `anon`/`authenticated`).
O servidor valida cada acesso administrativo pelo Supabase Auth e usa a chave
privada apenas no servidor. A sessão fica em cookie criptografado `HttpOnly`,
`SameSite=Strict`, `Secure` em HTTPS, com duração de 8 horas e renovação do token
de acesso no servidor. Nenhuma senha ou token de sessão é salvo no JavaScript
ou no armazenamento local do navegador.

O painel mostra online agora, pico simultâneo registrado, e a data/hora desse
pico em **America/Sao_Paulo**. A estatística é persistida pelo heartbeat, só
muda quando um recorde maior é observado e mantém o primeiro horário em caso
de empate. O histórico começa em `tracking_since`, ao ativar a migração; não
reconstrói picos anteriores. `/api/admin/stats` é exclusivo do administrador.
O indicador atual considera a mesma janela de 2 minutos do contador público.

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
- `GET /api/municipios/catalogo?turno=2`: catálogo nacional de municípios, agrupado por UF, com códigos TSE e IBGE.
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

Abra a aba **Mapa** e selecione um estado no mapa ou no seletor.
Os nomes dos 27 estados/DF aparecem na visão nacional, com linhas de indicação
para os estados menores. O seletor compacto **Brasil · Estados / Cidades** fica
no canto superior do próprio mapa. **Cidades** mostra os municípios de todo o
Brasil, com os mesmos percentuais, cores graduais, busca e popups.

Os resultados nacionais por cidade chegam em lotes de até 100 municípios; o
progresso aparece acima do mapa e as cores são preenchidas conforme cada lote
chega. Trocar de visão interrompe a fila e preserva os lotes já recebidos. O
primeiro turno fica em cache; o segundo é atualizado sem sobrepor carregamentos.
A lista nacional renderiza inicialmente 120 cidades e permite buscar ou mostrar
mais, para manter a interface leve.

A carga nacional consulta o acompanhamento oficial EA15 por UF: municípios
confirmados com zero seções totalizadas são mostrados como aguardando apuração,
sem requisitar um EA20 para cada cidade. Com seções apuradas, os votos vêm do
EA20 municipal; arquivos com horário confirmado e inalterado são reutilizados.
Se o acompanhamento falhar, a consulta usa os arquivos municipais normais.
Municípios ainda não consultados ou com erro não recebem liderança inventada.

 Clique em uma
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

## Mapa do exterior

Na visão Exterior, os resultados de presidente são consultados nos arquivos ZZ
do TSE, em lotes de 50 localidades. Os países são calculados por soma de votos
e seções, sem média de percentuais; a associação dos locais aos países e as fontes
da malha mundial estão em `data/README.md`. O resumo do exterior usa o arquivo
consolidado ZZ, sem somá-lo novamente ao Brasil. Consultas incompletas são marcadas
como parciais, e falhas na atualização preservam os dados anteriores sinalizados.
O segundo turno atualiza em segundo plano e o primeiro é reutilizado após sua
consulta inicial. A API `/api/exterior?turno=2&pagina=0` fornece o resumo oficial,
o catálogo de países e o lote de localidades usado na visão.

## Projeções

Os votos restantes são estimados pela fração de seções totalizadas em cada UF, mantendo a distribuição atual dos candidatos. A estimativa não possui margem de confiança e não constitui previsão oficial de vencedor. Consulte as premissas na aba Projeção.

## Hospedagem

O projeto utiliza um servidor Node.js para consultar o TSE. GitHub Pages sozinho não executa esse servidor. Para publicar o site, configure uma hospedagem compatível com Node.js.

## Contato

Guilherme Waltrick — (49) 99907-0882

Projeto independente, sem vínculo com a Justiça Eleitoral.
