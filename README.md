# BestStream para Stremio — 0.4.0

Integração com fontes do [BestFreeStreaming](https://www.bestfreestreaming.org/), com conferência de título/episódio e reprodução de mídia dentro do Stremio. O diretório não hospeda os vídeos e cada site precisa de um adaptador próprio.

## Instalar ou atualizar

Abra https://beststream-stremio-jean.onrender.com/ e use **Adicionar ao Stremio**. Os endereços anteriores foram preservados:

- `https://beststream-stremio-jean.onrender.com/native/manifest.json`
- `https://beststream-stremio-jean.onrender.com/manifest.json`

Remova a instalação anterior no Stremio e reinstale pelo mesmo endereço caso o cliente ainda apresente a versão antiga. Os dois manifestos recebem somente vídeo; os links de diretório ficam na página de configuração.

## Fluxo de reprodução

**Direto, padrão:** ao abrir um título, o add-on procura uma fonte compatível e devolve o endereço de mídia com os cabeçalhos exigidos pela fonte. O Stremio recebe o vídeo do CDN, sem retransmissão completa pelo Render. O manifesto mantém o recurso `stream` para IMDb, incluindo `tt…:temporada:episódio`.

**Ponte, opcional:** marque “Usar ponte pelo servidor” na instalação. O manifesto passa a ser `/bridge/native/manifest.json`. O cartão “BestStream • Automático” consulta a fonte quando se aperta Play; o vídeo, playlists, áudio, chaves HLS e segmentos passam pela ponte HTTP. O servidor preserva os cabeçalhos da fonte, reescreve URLs relativas e aceita requisições de intervalo para avanço no vídeo. URLs, cabeçalhos ou destinos arbitrários não são aceitos nos parâmetros da ponte.

A opção de ponte informa antes da instalação que consome tráfego da hospedagem. **No Render, excedentes de tráfego podem ser cobrados mesmo em serviços Free quando existe meio de pagamento cadastrado.** Não foi contratado um plano pago. Consulte [as regras oficiais](https://render.com/docs/free) e a [franquia de tráfego](https://render.com/docs/outbound-bandwidth). O modo Direto é o padrão para evitar retransmitir filmes pelo servidor.

## Adaptadores e limites

| Fonte | Integração |
| --- | --- |
| MoviePal | Página de reprodução com TMDB confirmado pelo Cinemeta, episódio exato, player incorporado e mídia verificada; prioridade do navegador |
| Fprime | Configuração pública do frontend e consulta HTTP para o TMDB/episódio exatos; disponibilidade experimental |
| Nexa | Player do título/episódio exatos; fallback quando a fonte permite obter mídia |
| BingeBang | Busca e identificação de título/episódio; pode exigir verificação manual |
| Demais sites | Diretório de navegação; sem extrator nativo implementado |

MoviePal substitui a dependência principal do Nexa, que deixou de entregar mídia nas consultas observadas em 12/11/2026. A lista de sites recebe atualização em segundo plano; a primeira consulta pode usar o snapshot de referência de 06/11.

O sistema não contorna autenticação, CAPTCHA ou DRM. Não troca o filme por trailers, demonstrações ou páginas HTML. A conferência usa o mapeamento IMDb/TMDB, a rota da fonte e o episódio exibido; não é uma comparação visual integral da obra. Fontes externas, bloqueios, expiração de links, codecs e a conexão do aparelho continuam determinando a disponibilidade. Não há garantia de todo o catálogo nem de ausência de travamentos.

O Render Free pode suspender por ociosidade e demorar para iniciar. Sessões da ponte são temporárias e se encerram em reinício/deploy; é necessário reabrir o vídeo nesse caso. Links de mídia assinados não são gravados no repositório.

## Verificar e executar

Requer Node.js 24. Chromium é necessário para os adaptadores de navegador.

```sh
npm ci --omit=optional --ignore-scripts
npx playwright install --with-deps chromium
npm test
npm run check
npm start
```

Os testes locais cobrem protocolo, IDs/episódios, fila de consultas, fallback, mídia, segurança de destinos, playlists e o caminho HTTP de reprodução. Quando FFmpeg está disponível, um teste gera mídia controlada e verifica a decodificação de áudio e vídeo através da ponte; esse material existe apenas no teste.

```sh
node scripts/bridge-smoke.js # filmes/episódio reais: decodifica áudio e vídeo nos modos Direto e Ponte
node scripts/hosted-smoke.js # verifica a versão publicada e os vídeos a partir de outro servidor
```

As consultas reais podem falhar por mudanças ou bloqueios da fonte. Fixtures não substituem esses testes. Consulte [docs/VALIDATION.md](docs/VALIDATION.md) para o alcance e resultados observados.

## Hospedagem e código

O `render.yaml` usa o serviço Docker existente no Free, sem banco. O Dockerfile executa os testes e instala Chromium. `/healthz` informa a versão e o commit publicado. A publicação deve apontar para o commit efetivamente testado.

Referências: [protocolo Stremio](https://stremio.github.io/stremio-addon-sdk/protocol.html), [formato de streams e cabeçalhos](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/stream.md), [Render Free](https://render.com/docs/free).

Projeto independente, sem afiliação com os serviços citados.
