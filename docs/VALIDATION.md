# Ajuste 0.5.3 — variante de inspeção e atribuição dos players

A 0.5.2 entrou em produção, mas seu teste do primeiro acesso ainda não confirmou os três títulos. A espera do player continua necessária; ele não produziu candidatos no primeiro intervalo de Alpha na hospedagem.

O domínio Referer de uma mídia não basta para identificar qual botão do MoviePal a originou: servidores diferentes podem incorporar o mesmo player. A atribuição anterior de todos os retornos Cinesrc ao botão Alpha era uma inferência, não uma comprovação. O log agora registra a hierarquia de domínios dos frames ativos, sem URLs de vídeo, parâmetros ou tokens.

A 0.5.3 combina a espera contínua do controle Play com prioridade aos fallbacks Charlie/Delta observados na hospedagem. A inspeção também escolhe a menor variante de vídeo disponível na playlist, para reduzir o trabalho de decodificação no host gratuito. O endereço original do master continua sendo o entregue ao Stremio, com todas as opções de qualidade e áudio. O filtro de aviso permanece obrigatório.

---

# Ajuste 0.5.2 — aguardar o player real

A validação publicada da 0.5.1 também encontrou listas vazias no primeiro acesso: https://github.com/diasjean100/beststream-stremio/actions/runs/43425572114 . Consultas posteriores receberam mídia, incluindo Teen Wolf com quadros verificados em outra conexão. Os filmes não foram validados nessa conexão local.

Os cabeçalhos dos streams revelaram que a mídia atribuída a Charlie/Delta tinha origem no player Cinesrc (Alpha). Portanto, a priorização da 0.5.1 usou uma atribuição que a inspeção posterior não confirmou. O player demorava a ficar interativo no Render; dois cliques iniciais terminavam cedo e a descoberta era abandonada. Probes de áudio também podiam chegar antes da mídia de vídeo.

A 0.5.2 acompanha o controle Play durante o orçamento da fonte, continua após probes não reproduzíveis e troca imediatamente ao identificar o aviso Atlantic. Respostas de frames já removidos são ignoradas. Chromium é preparado ao iniciar o serviço e continua sendo encerrado por ociosidade. O novo teste controlado exige recuperar vídeo quando Play só aparece depois das duas tentativas que a implementação anterior fazia.

A conferência real no runner da 0.5.1 passou para os três títulos, com áudio/vídeo e quadros aos 60 e 300 segundos: https://github.com/diasjean100/beststream-stremio/actions/runs/43425164280 . Esses quadros foram baixados e as imagens dos três títulos também foram inspecionadas visualmente. Isso não eliminou a necessidade de testar o primeiro acesso no Render.

---

# Ajuste 0.5.1 — prazo de resposta na hospedagem

A versão 0.5.0 entrou em produção no Render em 13/11/2026, commit `3543bb74555b063a8af05e880d597485e36fc199`. O filtro registrou `blocked-slate` na hospedagem: o aviso codificado foi efetivamente rejeitado.

O teste publicado https://github.com/diasjean100/beststream-stremio/actions/runs/43423714282 falhou: os três endpoints retornaram lista vazia após 25 segundos. Os logs mostraram que MoviePal Alpha e Beta não produziram candidatos nesse host. Charlie validou mídia depois do prazo. Isso revelou uma segunda falha de integração que os testes apenas no runner não reproduziam.

A versão 0.5.1 prioriza Charlie, preserva os outros servidores como fallback e devolve o primeiro candidato que passa em todas as verificações, sem esperar pela validação duplicada de outros candidatos. Os filtros do FFmpeg também usam um thread para respeitar os recursos do host. O prazo não foi ampliado para esconder a demora. O comportamento publicado é retestado após o deploy.

O teste de quadros posteriores foi corrigido para selecionar os segmentos pelos tempos da playlist, sem depender do seek remoto do FFmpeg. O teste anterior de captura por seek falhou para os filmes, sem produzir imagens; por isso não comprovava bloqueio nem reprodução desses trechos. Teen Wolf foi capturado e inspecionado visualmente aos 60 e 300 segundos, com cenas de vídeo e sem o aviso, no runner. A conferência com segmentos limitados exige novamente que os três títulos passem.

---

# Auditoria 0.5.0 — aviso codificado no vídeo

Registro de 13/11/2026. Esta auditoria corrige a interpretação dos testes históricos abaixo: decodificar faixas de áudio e vídeo não comprova que os quadros contêm o filme solicitado.

## Causa reproduzida

A produção 0.4.1 retornou Fprime como vencedor para Matrix (`tt0133093`), Inception (`tt1375666`) e Teen Wolf S1E1 (`tt1567432:1:1`). Foram lidas as playlists e baixados apenas pequenos segmentos de amostra. FFmpeg decodificou os quadros, e a inspeção visual reproduziu exatamente o aviso Atlantic enviado pelo usuário. O texto também foi identificado por Tesseract. Matrix apresentou o aviso no início, aos 60 segundos e aos 300 segundos; os outros dois títulos no início.

Os caminhos de instalação e os streams já não usavam páginas HTML nem `externalUrl`. O problema persistente estava no conteúdo de vídeos tecnicamente válidos. A hipótese anterior de um link externo da interface não explicava essa reprodução.

## Correção e teste de regressão

A validação precisa decodificar um quadro do prefixo limitado do primeiro segmento e verificar seu texto. O aviso reproduzido é rejeitado; falhas de decodificação/OCR também não viram streams. AES-128 de transporte, quando suportado, passa pela mesma conferência. DRM continua recusado. A inspeção é serializada e os subprocessos têm prazo, limite de saída e um thread.

O arquivo `test/fixtures/atlantic-warning.ts` é um trecho de aproximadamente 73 KiB do aviso reproduzido; não contém URLs assinadas, chaves ou dados de conta. Ele demonstra o falso positivo anterior: tem assinatura MPEG-TS e quadros decodificáveis, mas não é uma opção de reprodução válida. O teste exige sua rejeição em todos os quatro manifestos antigos e nas rotas Play. Um controle de vídeo gerado no teste é aceito.

A troca de servidores de MoviePal preserva o título e episódio e descarta candidatos da tentativa anterior. Sua verificação controlada testa a seleção de Charlie utilizável após a origem inicial recusada. Disponibilidade em fontes reais é conferida separadamente; testes controlados não são prova de catálogo externo disponível.

33 testes locais passaram, sem skips; a checagem de sintaxe passou. Testes externos e publicação desta versão são registrados após a conclusão das respectivas execuções.

## Limites

O filtro reconhece o aviso no quadro inicial. Não assiste à obra completa nem garante ausência de bloqueios em quadros futuros, em outra rede ou em outro aparelho. Não comprova a língua de áudio/legendas nem identifica visualmente cada obra. O caminho de reprodução continua somente de links: o servidor lê amostras limitadas e o Stremio recebe mídia diretamente da fonte. Nenhum recurso pago foi configurado.

---

## Histórico com interpretação limitada

Os registros abaixo comprovam somente os testes técnicos descritos. A inferência anterior de que eram prova suficiente de conteúdo correto foi invalidada pelo aviso que também decodifica como vídeo.

# Correção 0.4.1 — ponte apenas de links

Registro iniciado em 13/11/2026 (Brasília). A imagem enviada pelo usuário exibe um aviso do domínio Atlantic sobre VPN/proxy. Isso não prova que o aparelho utiliza VPN nem que o Render tenha causado o aviso. O diretório publicado tinha Atlantic com `adapter: null`, mas a interface oferecia “Abrir site”. Esse caminho manual foi removido.

O código de retransmissão de vídeo e seu transporte de streaming foram excluídos. Todos os quatro IDs de instalação anteriores passam a devolver URLs da fonte e cabeçalhos do player. As rotas antigas Play apenas redirecionam; `/relay` retorna 410. A hospedagem executa consultas e verificações limitadas, sem servir o filme completo.

27 testes locais passaram, incluindo um teste FFmpeg que recebeu áudio/vídeo do servidor de origem e verificou que o servidor do add-on recebeu somente a consulta de streams. Sintaxe e diff foram verificados. Os adaptadores continuam sujeitos aos bloqueios e mudanças das fontes. Reelix foi acrescentado como integração experimental com confirmação de TMDB, tipo, título e episódio.

Teste externo aprovado da ponte de links: https://github.com/diasjean100/beststream-stremio/actions/runs/43357458452 . Código funcional testado: `a4c61bd2fe8da4989d21d41b95bf3f19d3c4668b`.

O runner decodificou seis segundos de vídeo e áudio obrigatórios de Matrix, Inception e Teen Wolf S1E1, recebidos diretamente do CDN da fonte MoviePal. Todas as variantes antigas de instalação devolveram URLs da origem, sem `externalUrl` nem endereço de retransmissão. A busca inicial levou aproximadamente 4 a 5 segundos nessas amostras.

Reelix foi consultado separadamente para Matrix e Teen Wolf S1E1: retornou zero streams nas duas consultas. Sua reprodução permanece sem confirmação; não é cobertura adicional validada. O workflow de protocolo também passou: https://github.com/diasjean100/beststream-stremio/actions/runs/43357458526 .

Os resultados das versões anteriores abaixo são históricos; testes locais não substituem a verificação externa da versão publicada.

---

# Validação — BestStream 0.4.0

Registro de 12/11/2026 (horário de Brasília). Resultados se limitam às amostras, conexões e duração descritas.

## Falha reproduzida na versão anterior

O serviço publicado na versão 0.3.1 respondeu à consulta de The Matrix sem streams, após aproximadamente um minuto. Os logs de produção também mostraram consultas Nexa com zero candidatos e timeouts em Play. Os resultados de 07/11 abaixo são históricos e não comprovam disponibilidade atual.

## Mudança verificada

O modo Direto prioriza MoviePal e entrega mídia e cabeçalhos ao Stremio; o vídeo vem do CDN. O modo Ponte é uma instalação opcional que começa a busca ao apertar Play e retransmite a mídia pelo servidor. A página avisa sobre tráfego e possíveis excedentes do Render antes de selecionar esse modo.

A fila serializa consultas de navegador. Uma consulta HTTP pode avançar junto com o navegador, sem abrir vários Chromium ao mesmo tempo. Falhas de uma fonte não são transformadas em links HTML apresentados como vídeo.

## Testes locais

27 testes passaram, incluindo a decodificação de áudio e vídeo através da ponte com um HLS gerado exclusivamente para o teste. A verificação de sintaxe e `git diff --check` passaram. Testes controlados não provam a disponibilidade das fontes externas.

## Filmes e episódio reais

Execução aprovada: https://github.com/diasjean100/beststream-stremio/actions/runs/43353699982

Código: `24509f92c13ac09ecc21d2bf5416c3d5e79597a7`.

O teste abriu os endpoints do add-on no runner, recebeu o stream, requisitou a mídia e usou FFmpeg para decodificar seis segundos com faixas de vídeo e áudio obrigatórias, tanto no modo Direto quanto na Ponte. URLs assinadas e cabeçalhos da fonte não foram publicados nos logs.

| Amostra | Fonte | Lista de streams | Áudio e vídeo direto | Áudio e vídeo pela ponte |
| --- | --- | ---: | --- | --- |
| The Matrix — tt0133093 | MoviePal | 5,8 s | Passou | Passou |
| Inception — tt1375666 | MoviePal | 3,5 s | Passou | Passou |
| Teen Wolf S1E1 — tt1567432:1:1 | MoviePal | 4,8 s | Passou | Passou |

Os tempos são observações da execução, sem garantia para outra rede ou para o primeiro acesso após suspensão. Fprime não validou mídia nessas consultas. Nexa e BingeBang são alternativas experimentais, não cobertura adicional confirmada nesta versão.

O workflow de protocolo também passou: https://github.com/diasjean100/beststream-stremio/actions/runs/43353699957 .

## Limites e verificação da hospedagem

A reprodução em um aplicativo Stremio real no celular/TV do usuário não foi executada. Não foi assistido o filme inteiro, nem verificada a língua de cada faixa, todas as legendas ou todo o catálogo. A identificação combina o IMDb/TMDB, a página da fonte e o episódio exibido; não foi feita uma identificação visual integral da obra.

O workflow `hosted-check.yml` verifica separadamente o commit publicado no Render e consulta as playlists e bytes de vídeo a partir de outro servidor. Um deploy aceito, um manifesto respondendo e esse teste de mídia são verificações distintas. O estado atual da publicação deve ser conferido em `/healthz` e nas execuções desse workflow.

A ponte opcional consome tráfego do Render; o modo Direto é o padrão. Não foi alterado o plano Free nem contratado recurso pago. Referências de cobrança: https://render.com/docs/free e https://render.com/docs/outbound-bandwidth .

---

# Histórico — BestStream 0.3.1

Registro atualizado em 07/11/2026. Resultados de rede descrevem as amostras e as conexões utilizadas, sem garantia de todo o catálogo ou disponibilidade futura.

## Publicação confirmada

- Página: https://beststream-stremio-jean.onrender.com/
- Instalação recomendada: https://beststream-stremio-jean.onrender.com/native/manifest.json
- Repositório: https://github.com/diasjean100/beststream-stremio
- Render: serviço srv-dbn6mlrrjlhs739lhaug, plano Free, região Virginia.
- Deploy dep-dbn88gd6e07s73dtuk3g com estado live.
- Código da produção: db36244781206a41e7f729ae1592cf642cc84f9d, versão 0.3.1.
- O relatório e os ajustes de documentação posteriores não alteram o código do serviço.

## Problemas corrigidos

A navegação podia esgotar o prazo mesmo depois de o título e os controles do player aparecerem. A integração agora exige a identidade exata do título e do episódio, sem depender do evento de carregamento completo da página. Um clique Play que já virou Pause também deixa de ser tratado como falha de reprodução.

O modo comum aguarda até 22 segundos pelo vídeo na primeira consulta. O modo Direto retorna somente mídia validada e é a opção selecionada na página de instalação. Nenhum link HTML ou iframe é apresentado como vídeo.

A validação HLS consulta a playlist, uma variante quando existir e o início de um segmento. Os bytes precisam corresponder a vídeo; áudio isolado, HTML, segmentos recusados e formatos DRM não suportados são descartados. O adaptador considera candidatos que chegam depois das primeiras playlists de áudio, com até duas verificações de mídia simultâneas. Os cabeçalhos Referer, Origin e User-Agent observados no player são preservados quando necessários.

O navegador usa contextos isolados e é reutilizado entre consultas próximas. A abertura da página de instalação prepara o navegador, sem consultar a fonte. Após 45 segundos sem uso, o navegador é fechado para liberar memória.

## Código e protocolo

Dezenove grupos de testes locais passaram, assim como a verificação de sintaxe e o job de protocolo do GitHub Actions. Cobrem IDs e episódios, rede privada, cache, diretório, conteúdo de mídia, variantes HLS, segmentos com extensão de imagem, cabeçalhos, mapeamento IMDb/TMDB, protocolo HTTP, Unicode e retorno de vídeo na primeira consulta.

O render.yaml foi validado anteriormente com o JSON Schema oficial do Render. A imagem Docker foi construída e publicada. O manifesto nativo, a versão e o commit foram conferidos no serviço. A página de instalação foi verificada no navegador, com o modo Direto selecionado e o endereço stremio:// correspondente.

## Teste da produção a partir de outro servidor

O workflow só iniciou as consultas depois de confirmar a versão 0.3.1 e o commit exato em /healthz. Ele pediu os streams ao Render e consultou as playlists e os trechos de vídeo a partir do runner do GitHub.

Execução: https://github.com/diasjean100/beststream-stremio/actions/runs/42326295962

| Amostra | Streams diretos do Render | Mídias validadas no segundo servidor | Tempo observado da consulta e validação |
| --- | ---: | ---: | ---: |
| The Matrix — tt0133093 | 2 | 2 | 21,2 s |
| Inception — tt1375666 | 2 | 2 | 21,0 s |
| Breaking Bad S1 E1 — tt0903747:1:1 | 2 | 2 | 20,0 s |
| Breaking Bad S2 E3 — tt0903747:2:3 | 2 | 2 | 18,3 s |

O workflow terminou com sucesso. Os tempos descrevem esses testes; não são uma promessa de latência. O primeiro acesso após a suspensão do Render pode demorar mais.

## Diferenças entre conexões

O teste separado que executa o próprio extrator inteiramente no runner do GitHub retornou mídia para Matrix, Inception e Breaking Bad S1E1, mas não validou mídia para S2E3. Esse job terminou com falha. O mesmo episódio foi validado pelo endpoint da produção e por seu teste a partir do segundo servidor. A causa exata dessa diferença não foi comprovada.

Na conexão local de análise, pedidos de segmentos ao CDN receberam HTTP 403; isso não foi contornado. Não é possível concluir que o vídeo funcionará em toda rede ou aparelho a partir dos testes entre servidores.

O BingeBang exigiu verificação do Cloudflare e continua sem reprodução direta confirmada. Nenhum CAPTCHA, autenticação, DRM ou bloqueio de segurança foi contornado.

## Alcance e limites

A integração funcional de vídeo demonstrada é a Nexa, com mapeamento IMDb/TMDB e episódio exato. A lista de 55 sites continua sendo um diretório: não representa 55 extratores nativos. Não há confirmação de todos os filmes, séries ou episódios do BestFreeStreaming.

A reprodução em um aplicativo Stremio real no dispositivo do usuário não foi executada. A inspeção de playlists e trechos de vídeo valida o protocolo e os bytes de mídia, mas não verifica a reprodução completa, cada faixa de áudio, legendas ou compatibilidade de Windows, Android ou TVs. A identificação do título usa os IDs e a página da fonte; não foi feita uma comparação visual integral de cada filme.

Os testes anteriores no navegador da fonte reproduziram Matrix por 124 segundos e Breaking Bad S1E1 por 317 segundos, sem erro de mídia. Esses testes são distintos da reprodução nativa do add-on.

## Hospedagem

O projeto não retransmite filmes completos pelo Render: faz consultas e lê pequenos prefixos de segmentos para validar mídia. A reprodução usa a fonte externa. Não foram configurados recursos pagos.

O plano Free continua sujeito a suspensão por ociosidade, recursos e franquias da conta: https://render.com/docs/free. As atualizações desta sessão exigiram deploy manual após o push. Um webhook funcional de atualização automática não foi confirmado.

Os links temporários de vídeo ficam em cache curto e não são gravados no repositório. Cookies de conta e credenciais não foram incorporados ao projeto ou aos logs de teste.
