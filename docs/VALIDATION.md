# Validação — BestStream 0.3.1

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
