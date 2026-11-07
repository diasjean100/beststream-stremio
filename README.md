# BestStream para Stremio

Add-on em português com busca de filmes e séries pelo IMDb, página de instalação e diretório de fontes do [BestFreeStreaming](https://www.bestfreestreaming.org/).

**Estado: beta 0.3. O Render retornou vídeos HLS diretos para The Matrix e Breaking Bad S1E1; as playlists também responderam fora do servidor. A instalação recomenda o modo Direto. Não há cobertura confirmada de todos os sites, filmes ou episódios.**

## O que está implementado

- Recursos `manifest`, `catalog` e `stream` no protocolo HTTP do Stremio, com CORS.
- Identificadores IMDb compatíveis com títulos abertos a partir de outros catálogos: `tt…` para filmes e `tt…:temporada:episódio` para séries.
- Dois modos: **Fontes**, com acesso ao navegador, e **Direto**, que só retorna mídia quando a verificação passa.
- Busca de títulos pelo Cinemeta. A busca não comprova a disponibilidade de vídeo na fonte. O modo Fontes oferece também a página do título ou episódio no Nexa, identificada como navegação externa e sem afirmar disponibilidade.
- Lista de referência de 55 entradas da página inicial, consultada em 06/11/2026, e tentativa de atualização do diretório a cada 12 horas. Sites listados não são 55 extratores implementados.
- Adaptadores experimentais: BingeBang para busca por título e episódio; Nexa para filmes e episódios com o TMDB associado ao IMDb pelo Cinemeta. Vídeo direto exige verificação do conteúdo HLS/MP4. URLs temporárias não são gravadas no código.
- Os demais sites são links externos. Abertura do site, extração de vídeo, validação HTTP e reprodução no aparelho são etapas diferentes.
- Cache limitado, isolamento de consultas do navegador, limite de requisições e bloqueio de destinos privados nas requisições do servidor.

## Limitação central

O BestFreeStreaming **não hospeda vídeos**; é um diretório de serviços diferentes. Não existe uma API única de vídeos confirmada nessa página. Cada integração precisa de manutenção e testes próprios. O adaptador não resolve CAPTCHAs, não remove DRM e não contorna autenticação. Links podem expirar ou depender do IP e do navegador. Uma playlist respondendo no servidor não garante reprodução em outro IP ou aparelho.

O modo padrão aguarda até 22 segundos pelo vídeo antes de oferecer alternativas. O modo Direto aguarda a resolução da fonte e retorna somente mídia. O botão **“Abrir fontes” abre o navegador**. O modo Direto retorna uma lista vazia quando não confirma um vídeo. Não usamos páginas HTML, iframes ou vídeos de demonstração como se fossem o filme solicitado.

## Executar

Requer Node.js 24.

```sh
npm ci --omit=optional --ignore-scripts
npx playwright install --with-deps chromium
npm test
npm run check
npm start
```

Abra `http://localhost:7000`. Para instalar, use a página ou cole um dos endereços no Stremio:

- Fontes: `http://localhost:7000/manifest.json`
- Somente direto: `http://localhost:7000/native/manifest.json`

Instalação publicada: https://beststream-stremio-jean.onrender.com/ — o botão recomenda o manifesto https://beststream-stremio-jean.onrender.com/native/manifest.json.

## Render

[Preparar publicação no Render](https://dashboard.render.com/blueprint/new?repo=https://github.com/diasjean100/beststream-stremio)

O `render.yaml` prepara um único serviço Docker no plano Free, sem banco e sem chave de API. O Dockerfile instala Chromium e executa os testes antes de iniciar. O serviço escuta em `0.0.0.0:$PORT`, oferece `/healthz` e usa `RENDER_EXTERNAL_URL` como endereço canônico. O Blueprint precisa estar no GitHub antes de ser aplicado.

O plano gratuito tem recursos e franquias limitados, pode suspender o serviço por ociosidade e pode ser insuficiente para extração com navegador. O sistema não retransmite filmes pelo servidor nem configura serviços pagos. Consumo de rede e builds continuam sujeitos às regras da conta Render. Veja [limites oficiais](https://render.com/docs/free).

## Verificações

```sh
npm test       # dezenove grupos de testes locais, sem depender das fontes externas
npm run check  # sintaxe de todos os arquivos JavaScript
npm run smoke  # teste real: filme + episódio; falha se não houver vídeo direto
```

O GitHub Actions executa os testes locais. O smoke ao vivo pode ser disparado manualmente e quando o próprio roteiro de smoke muda; não executa consultas a cada alteração comum. Falha nesse teste significa que a integração não foi validada; os testes com fixtures não substituem esse resultado. Não são registrados links assinados, cookies nem tickets das fontes nos logs do smoke.

Consulte [o registro de validação](docs/VALIDATION.md) para saber exatamente o que foi observado.

## Rotas

| Rota | Função |
| --- | --- |
| `/` ou `/configure` | Instalação, busca e fontes |
| `/manifest.json` | Add-on com vídeos diretos e botão de navegador |
| `/native/manifest.json` | Add-on apenas de vídeo direto |
| `/stream/movie/tt0063350.json` | Fontes do filme |
| `/stream/series/tt0903747:1:1.json` | Fontes de um episódio específico |
| `/catalog/movie/beststream-movies/search=nome.json` | Busca de filmes |
| `/catalog/series/beststream-series/search=nome.json` | Busca de séries |
| `/api/sources` | Diretório e origem dos dados |
| `/api/resolve?type=movie&id=tt0063350` | Diagnóstico da consulta, sem URL arbitrária |
| `/healthz` | Saúde do serviço |

## Fontes técnicas

- [Protocolo oficial do Stremio](https://stremio.github.io/stremio-addon-sdk/protocol.html)
- [Formato oficial de streams](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/stream.md)
- [Formato oficial do manifesto](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md)
- [Playwright oficial](https://github.com/microsoft/playwright)
- [Especificação do Render](https://render.com/docs/blueprint-spec)

Projeto independente, sem afiliação com Stremio, BestFreeStreaming ou os sites listados.
