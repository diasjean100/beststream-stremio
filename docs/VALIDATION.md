# Registro de validação — 06/11/2026

## Evidências obtidas

- A página inicial de `bestfreestreaming.org` foi lida por ferramenta de pesquisa. Ela declara que não hospeda arquivos de vídeo e contém 55 entradas na lista principal, incluindo uma página de domínios do Rive.
- Foram consultadas as páginas de filmes e séries do diretório, as páginas públicas de BingeBang e Nexa e a documentação oficial de protocolo, manifesto e streams do Stremio.
- A navegação no BingeBang abriu a página de um filme e seu reprodutor. O vídeo progrediu no navegador e foram observadas requisições HLS. Isso valida somente aquele reprodutor naquele navegador.
- A configuração pública do reprodutor inclui IMDb e episódio e usa endereços temporários. Esses endereços não foram colocados no projeto.
- Downloads do BingeBang apresentam configuração de verificação antirrobô. Ela não foi resolvida nem contornada.
- Dez grupos de testes locais passaram: IDs, rede privada, cache, diretório, tipos de mídia, identidade do episódio, modos do add-on, streams, catálogo e servidor HTTP. Os testes usam fixtures e provedores simulados.
- A verificação de sintaxe JavaScript passou.

## Ainda não comprovado

- Funcionamento do adaptador de ponta a ponta em um servidor público.
- Reprodução nativa de filme ou episódio em um aplicativo Stremio real.
- Compatibilidade em Samsung, LG, Android TV ou outros aparelhos específicos.
- Cobertura de todos os filmes, temporadas e episódios das fontes listadas.
- Extração de vídeo nos outros sites: eles são links de diretório, sem adaptador nativo nesta versão.
- Build da imagem Docker em Render e disponibilidade de URL pública: dependem do deploy.

As requisições diretas do ambiente de desenvolvimento ao Cinemeta e ao BingeBang falharam na resolução de DNS (`EAI_AGAIN`). A leitura pelo navegador e pelas ferramentas de pesquisa não comprova que o processo Node do add-on tenha esse mesmo acesso. Essa limitação foi preservada, sem transformar testes com fixtures em alegação de funcionamento ao vivo.

## Aceite antes de declarar pronto

1. Build concluído e deployment com estado `live`.
2. `/healthz` e `/manifest.json` acessíveis via HTTPS.
3. Teste de integração real do filme e do episódio, sem retornar link de navegador como substituto de vídeo.
4. Reprodução validada no Stremio e no aparelho do usuário.
5. Qualquer ampliação de cobertura acompanhada de testes próprios por fonte e por episódio.
