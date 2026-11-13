# BestStream para Stremio — 0.5.2

Integração com fontes do [BestFreeStreaming](https://www.bestfreestreaming.org/), com conferência de título/episódio e reprodução de mídia dentro do Stremio. O diretório não hospeda os vídeos e cada site precisa de um adaptador próprio.

## Instalar ou atualizar

Abra https://beststream-stremio-jean.onrender.com/ e use **Adicionar ao Stremio**. Os endereços anteriores foram preservados:

- `https://beststream-stremio-jean.onrender.com/native/manifest.json`
- `https://beststream-stremio-jean.onrender.com/manifest.json`

Remova a instalação anterior no Stremio e reinstale pelo mesmo endereço caso o cliente ainda apresente a versão antiga. Os quatro manifestos antigos recebem a mesma validação de vídeo. A fonte exibida no Stremio inclui a versão 0.5.2 para facilitar a conferência.

## Fluxo de reprodução

**Direto, padrão:** ao abrir um título, o add-on procura uma fonte compatível e devolve o endereço de mídia com os cabeçalhos exigidos pela fonte. O Stremio recebe o vídeo do CDN, sem retransmissão completa pelo Render. O manifesto mantém o recurso `stream` para IMDb, incluindo `tt…:temporada:episódio`.

**Ponte de links, único funcionamento:** o servidor descobre e valida o endereço de mídia; o Stremio recebe esse endereço com os cabeçalhos exigidos. O vídeo vem diretamente da fonte. Não existe mais modo de retransmissão completa pelo Render.

As instalações antigas em `/bridge/manifest.json` e `/bridge/native/manifest.json` preservam seus IDs, mas agora retornam os mesmos links diretos. As antigas rotas `/play` só redirecionam para mídia confirmada. `/relay` retorna HTTP 410 e não acessa destinos externos.

A hospedagem continua necessária para executar a busca e fazer verificações limitadas de mídia. O servidor lê playlists e pequenos prefixos de segmentos, sem armazenar nem servir o filme completo. O plano Free foi mantido. Limites da hospedagem continuam se aplicando às consultas: [Render Free](https://render.com/docs/free).

## Correção do aviso Atlantic

Em 13/11/2026 a auditoria reproduziu a imagem do usuário ao decodificar um stream real da produção. A fonte Fprime devolvia uma playlist e segmentos válidos de vídeo, mas os quadros mostravam apenas o aviso do Atlantic. O mesmo aviso apareceu no início de três títulos e aos 60 e 300 segundos de Matrix. As verificações anteriores de HTTP, HLS e decodificação não distinguiam esse aviso do conteúdo solicitado.

A validação agora lê no máximo 1 MiB do primeiro segmento, decodifica um quadro com FFmpeg e extrai texto com Tesseract. Avisos identificados como Atlantic, Cloudflare Warp ou classroom.best são rejeitados. Falhas no decodificador ou OCR também impedem a oferta do candidato. Isso verifica o quadro inicial, não identifica integralmente o filme nem garante que um bloqueio não apareça depois ou em outra conexão.

MoviePal tenta os controles reais Alpha, Charlie, Beta, Delta e Echo antes de desistir, preservando a página do título/episódio confirmado. Um aviso rejeitado não é apresentado como uma opção para assistir. A página de instalação também deixou de incluir o link de saída para o diretório e exibe o endereço para instalação manual.

## Adaptadores e limites

| Fonte | Integração |
| --- | --- |
| MoviePal | Página de reprodução com TMDB confirmado pelo Cinemeta, episódio exato, player incorporado e mídia verificada; prioridade do navegador |
| Reelix | Busca por título com TMDB/tipo/ano exatos e validação da identidade da página e do episódio; integração experimental |
| Fprime | Configuração pública do frontend e consulta HTTP para o TMDB/episódio exatos; disponibilidade experimental |
| Nexa | Player do título/episódio exatos; fallback quando a fonte permite obter mídia |
| BingeBang | Busca e identificação de título/episódio; pode exigir verificação manual |
| Demais sites | Diretório de navegação; sem extrator nativo implementado |

MoviePal substitui a dependência principal do Nexa, que deixou de entregar mídia nas consultas observadas em 12/11/2026. A lista de sites recebe atualização em segundo plano; a primeira consulta pode usar o snapshot de referência de 06/11.

O sistema não contorna autenticação, CAPTCHA ou DRM. Não troca o filme por trailers, demonstrações ou páginas HTML. A conferência usa o mapeamento IMDb/TMDB, a rota da fonte e o episódio exibido; não é uma comparação visual integral da obra. Fontes externas, bloqueios, expiração de links, codecs e a conexão do aparelho continuam determinando a disponibilidade. Não há garantia de todo o catálogo nem de ausência de travamentos.

O Render Free pode suspender por ociosidade e demorar para iniciar. URLs assinadas podem expirar; reabra o título para consultar uma fonte atualizada. Links de mídia assinados não são gravados no repositório.

## Verificar e executar

Requer Node.js 24, FFmpeg e Tesseract com o idioma inglês. Chromium é necessário para os adaptadores de navegador. O Dockerfile instala todas essas dependências.

```sh
sudo apt-get update && sudo apt-get install -y ffmpeg tesseract-ocr tesseract-ocr-eng
npm ci --omit=optional --ignore-scripts
npx playwright install --with-deps chromium
npm test
npm run check
npm start
```

Os testes locais cobrem protocolo, IDs/episódios, fila de consultas, fallback, mídia, segurança de destinos, playlists e o caminho HTTP de reprodução. O teste de regressão contém um trecho real do vídeo de aviso, sem URLs nem tokens, e exige sua rejeição em todos os endereços de instalação. Outro teste gera mídia controlada e comprova que áudio e vídeo são decodificados diretamente do servidor da fonte, enquanto o add-on recebe apenas a consulta de metadados. Esse material existe apenas no teste.

```sh
node scripts/bridge-smoke.js # filmes/episódio reais: decodifica áudio e vídeo direto da fonte e verifica os IDs antigos
node scripts/hosted-smoke.js # verifica a versão publicada e os vídeos a partir de outro servidor
```

As consultas reais podem falhar por mudanças ou bloqueios da fonte. Fixtures não substituem esses testes. Consulte [docs/VALIDATION.md](docs/VALIDATION.md) para o alcance e resultados observados.

## Hospedagem e código

O `render.yaml` usa o serviço Docker existente no Free, sem banco. O Dockerfile executa os testes e instala Chromium. `/healthz` informa a versão e o commit publicado. A publicação deve apontar para o commit efetivamente testado.

Referências: [protocolo Stremio](https://stremio.github.io/stremio-addon-sdk/protocol.html), [formato de streams e cabeçalhos](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/stream.md), [Render Free](https://render.com/docs/free).

Projeto independente, sem afiliação com os serviços citados.
