# Validação atual — 06/11/2026

## Publicação confirmada

- Página: https://beststream-stremio-jean.onrender.com/
- Manifesto padrão: https://beststream-stremio-jean.onrender.com/manifest.json
- Repositório: https://github.com/diasjean100/beststream-stremio
- Render: serviço srv-dbn6mlrrjlhs739lhaug, plano Free, região Virginia.
- Deploy dep-dbn77guc6qcc73cs1200 concluído com estado live.
- Código publicado: d1dae583191f48541428abac6cf9f5760e99cb2b, versão 0.2.0. Este relatório foi atualizado sem alterar o código do serviço.

## Verificações concluídas

1. Dezesseis grupos de testes locais passaram. Cobrem IDs e episódios, rede privada, cache, diretório, validação de mídia, mapeamento IMDb/TMDB, fontes externas, protocolo HTTP e buscas com acentos, ampersand e percentual.
2. A verificação de sintaxe passou. O GitHub Actions concluiu os checks de código com sucesso.
3. O render.yaml passou na validação com o JSON Schema oficial do Render. A imagem Docker foi construída e publicada.
4. /healthz, /manifest.json, /api/sources e busca de filmes responderam HTTP 200, com CORS. Matrix retornou 20 títulos.
5. O diretório ao vivo retornou 55 entradas. A inspeção das páginas está em [SOURCES.md](SOURCES.md). Resposta de uma página não foi tratada como prova de disponibilidade de vídeo.
6. A página de instalação, o botão de copiar, a troca de modo, o endereço stremio:// e o filtro foram verificados no navegador.

## Reprodução no navegador da fonte

| Amostra | Observação |
| --- | --- |
| The Matrix, tt0133093, TMDB 603 | Reprodução por 124 segundos; duração indicada de 8179 segundos, readyState 4 e nenhum erro de mídia |
| Breaking Bad S1 E1, tt0903747:1:1, TMDB 1396 | Página identificada como Breaking Bad S1 E1; reprodução por 317 segundos; duração de 3502 segundos, readyState 4 e nenhum erro de mídia |

Esses testes confirmam apenas as duas amostras naquele navegador. Não confirmam todo o catálogo, todos os sites, disponibilidade futura, áudio em português ou reprodução dentro de um aplicativo Stremio.

## Resultado do add-on hospedado

| Caso | Endpoint padrão | Apenas vídeo direto |
| --- | --- | --- |
| The Matrix | HTTP 200; Nexa no navegador e acesso ao diretório | HTTP 200; nenhum stream direto retornado |
| Breaking Bad S1 E1 | HTTP 200; Nexa no navegador e acesso ao diretório | HTTP 200; nenhum stream direto retornado |

O BingeBang apresentou verificação do Cloudflare ao servidor. A tentativa Nexa no servidor esgotou o tempo de navegação, apesar da reprodução nos testes independentes de navegador. Isso não prova que todos os sites estejam bloqueados: apenas duas integrações de reprodução foram implementadas; as demais são links de diretório.

Nenhum bloqueio foi contornado. Links temporários de teste, cookies de conta e credenciais não foram incorporados ao projeto.

## Limites do resultado

**A versão atual não cumpre a reprodução direta de todos os filmes, séries e fontes dentro do Stremio.** O modo Fontes oferece páginas externas pelo mapeamento IMDb/TMDB e uma lista de sites. Ele não transforma 55 entradas em 55 extratores nativos. O modo Direto continua experimental e pode retornar uma lista vazia.

A instalação no Stremio do usuário e a reprodução em Windows, Android, Samsung, LG ou outro cliente real não foram executadas nesta sessão. Uma playlist respondendo no servidor, quando houver, também não garante funcionamento em outro IP.

## Hospedagem e atualizações

O projeto não retransmite filmes pelo Render e não configura recursos pagos. O plano Free continua sujeito às franquias e à suspensão por ociosidade descritas em https://render.com/docs/free.

As atualizações desta sessão precisaram de disparo manual de deploy depois do push; um webhook funcional de atualização automática não foi confirmado. Antes de divulgar nova versão, conferir o commit e o estado live no Render e repetir os testes correspondentes.
