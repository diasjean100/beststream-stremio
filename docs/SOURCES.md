# Inspeção das fontes públicas — 06/11/2026

Consulta realizada no GitHub Actions, com requisições GET às páginas de entrada. O código não iniciou downloads de filmes, não resolveu verificações antirrobô e não executou JavaScript obtido das páginas.

**HTTP 200 nesta tabela comprova somente uma resposta da página, não a disponibilidade de filmes nem reprodução no Stremio.** Algumas páginas são diretórios de domínios ou páginas de status. HTML maior que 1 MB ficou sem análise completa.

| Fonte | Resultado observado | Reprodução nativa |
| --- | --- | --- |
| BingeBang | Cloudflare observado no teste anterior; consulta repetida omitida | Adaptador experimental; sem garantia de reprodução |
| Zoechip | HTTP 200; Zoechip - Watch Movies Online Free - Stream Tv Series Online Free | Não implementada; link de navegador |
| AllFlix | Página de verificação ou bloqueio; HTTP 403 | Não implementada; link de navegador |
| CineBros | HTTP 200; CineBros / Your next favourite | Não implementada; link de navegador |
| FlaxJoy | HTTP 200; FlaxJoy — Watch Movies and TV Shows Free | Não implementada; link de navegador |
| Fprime | HTTP 200; fprime - Watch Movies & TV Shows Online in HD | Não implementada; link de navegador |
| Reelix | HTTP 200; Reelix - Watch Movies, TV Shows & Anime Free in HD | Não implementada; link de navegador |
| Nexa | HTTP 200; Nexa | Adaptador experimental; sem garantia de reprodução |
| MoviePal | HTTP 200; MoviePal - Your Pal for Free Movies and TV Shows Online | Não implementada; link de navegador |
| Watched | HTTP 200; Home · watched | Não implementada; link de navegador |
| ZXCStream | HTTP 200; STREAM | Não implementada; link de navegador |
| Zenox | HTTP 200; Zenox | Não implementada; link de navegador |
| Vexo | HTTP 200; Vexo — Next-Gen Cinematic Universe • Studio Master Streaming | Não implementada; link de navegador |
| Nova | HTTP 200; here MUST match the home default in App.tsx's document.title effect, or a JS-rendering crawler sees  | Não implementada; link de navegador |
| Cinejoy | HTTP 200; Cinejoy | Não implementada; link de navegador |
| Atlantic | HTTP 200; Atlantic — Watch Movies and TV Shows Free | Não implementada; link de navegador |
| Rivo | Resposta excede o limite | Não implementada; link de navegador |
| Cinevu | HTTP 200; Cinevu — Movies & TV | Não implementada; link de navegador |
| ZetMoon | Página de verificação ou bloqueio; HTTP 403 | Não implementada; link de navegador |
| Flickbuff | HTTP 200; sem título | Não implementada; link de navegador |
| Flaxfer | HTTP 200; Flaxfer / Experience HD Streaming — Watch Movies & TV Shows Anywhere | Não implementada; link de navegador |
| FrameXTV | HTTP 200; frameXTV | Não implementada; link de navegador |
| Cineruv | HTTP 200; cineruv | Não implementada; link de navegador |
| FlyStream | Página de verificação ou bloqueio; HTTP 200 | Não implementada; link de navegador |
| CineHD | Resposta excede o limite | Não implementada; link de navegador |
| Filmex | HTTP 200; Filmex - Watch Free Movies & TV Shows Online / Stream Latest Releases | Não implementada; link de navegador |
| HydraHD | HTTP 200; HydraHD - (Status-Info) - The Official HydraHD Status Page | Não implementada; link de navegador |
| Dulo | HTTP 200; dulo — Watch Free Movies & TV Shows Online / dulo.mov | Não implementada; link de navegador |
| Redflix | HTTP 200; Redflix - Watch Free Movies & TV Shows Online / No Login Required | Não implementada; link de navegador |
| Rive | HTTP 200; Rive Domains | Não implementada; link de navegador |
| RidoMovies | HTTP 200; Browse All Movies & TV Series Online - RIDOMOVIES | Não implementada; link de navegador |
| Flixeo | HTTP 200; Flixeo - Watch Movies & TV Shows Online Free / Flixeo | Não implementada; link de navegador |
| HiMovies | HTTP 200; HiMovies.ac / Watch Movies Online, Stream Tv Shows online Free | Não implementada; link de navegador |
| MovieNerds | HTTP 200; MovieNerds — Premium Streaming | Não implementada; link de navegador |
| Flixbaba | HTTP 200; Flixbaba - Official Active Domains & Status Page | Não implementada; link de navegador |
| 1Shows | HTTP 200; 1Shows — Watch Movies, TV Shows & Anime Free in HD | Não implementada; link de navegador |
| NEPU | Página de verificação ou bloqueio; HTTP 403 | Não implementada; link de navegador |
| VidPlay | HTTP 200; VidPlay - Stream Movies and Series Online Free in HD | Não implementada; link de navegador |
| Freekz | Página de verificação ou bloqueio; HTTP 403 | Não implementada; link de navegador |
| StreamingUnity | HTTP 200; StreamingUnity | Não implementada; link de navegador |
| NetPrime | HTTP 200; NetPrime — Watch Movies & TV Shows Online | Não implementada; link de navegador |
| SolarMovie | HTTP 200; Watch FREE Movies Online & TV shows - SolarMovies | Não implementada; link de navegador |
| MyFlixer | HTTP 200; MyFlixer / Watch Movies Online, Stream Tv Shows online Free | Não implementada; link de navegador |
| MoviesJoy | HTTP 200; MoviesJoy Website - Free Movies and Tv Shows To Watch | Não implementada; link de navegador |
| YesMovies | HTTP 200; YesMovies.to / Watch FREE Movies Online & TV shows | Não implementada; link de navegador |
| TheFlixBay | HTTP 200; TheFlixBay - Watch Free Movies & TV Shows Online - Stream Instantly | Não implementada; link de navegador |
| HDToday | HTTP 200; HDToday website - Free Movies and Free Series Online | Não implementada; link de navegador |
| 2Flix | HTTP 200; Home / 2Flix | Não implementada; link de navegador |
| Flixer | HTTP 200; FLIXER - Stream Movies & TV Shows Free Online / Free Entertainment Platform | Não implementada; link de navegador |
| BoredFlix | HTTP 200; Watch Free Movies & TV Shows Online / BoredFlix | Não implementada; link de navegador |
| CornClick | HTTP 200; CornClick | Não implementada; link de navegador |
| Movish | Resposta excede o limite | Não implementada; link de navegador |
| MooPlay | HTTP 200; MooPlay &#8211; Watch Movies Online in HD for Free! | Não implementada; link de navegador |
| NOXX | Página de verificação ou bloqueio; HTTP 200 | Não implementada; link de navegador |
| AZMovies | Página de verificação ou bloqueio; HTTP 200 | Não implementada; link de navegador |

Testes reais de vídeo são registrados separadamente em [VALIDATION.md](VALIDATION.md). O HTTP da página e o número de sites listados não são tratados como cobertura de mídia.

