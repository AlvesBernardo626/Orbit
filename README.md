# Orbit

Aplicativo desktop de comunicação para grupos pequenos, com identidade visual própria. Electron + React + TypeScript, API Node/Express, Socket.IO, WebRTC P2P e MongoDB.

## Rodar localmente

```sh
npm ci
npm run setup
docker compose up -d --wait
npm run dev
```

`npm run setup` cria `.env` local com chave JWT aleatória. Configure MongoDB Atlas ou o replica set Docker antes de iniciar. Sem Docker, `npm run dev:db` inicia um banco descartável em outro terminal. Node 24 LTS recomendado. Windows e macOS são as plataformas desktop suportadas.

## Funcionalidades implementadas

- Contas, bcrypt, JWT, refresh com rotação e revogação; refresh protegido por Electron safeStorage.
- Perfil editável, avatar/banner escolhidos localmente, bio e status; imagens locais nos grupos.
- Solicitações, amizades, bloqueio e DMs com histórico, edição, exclusão, digitação, não lidas e paginação.
- Grupos de até 8 pessoas, proprietário/administradores/membros, transferência de propriedade e moderação.
- Presença e eventos via Socket.IO com autorização no servidor.
- Voz P2P com convite, toque, atendimento/recusa e tela ativa; mute, troca de microfone/saída,
  detecção de fala e recuperação de conexão.
- Escolha de tela/janela, transmissão com presets 720p/15, 1080p/30 e 1080p/60, controle de bitrate e encerramento da captura.
- Docker, CI, Blueprint Render, health checks e índices MongoDB.
- Deploy automático no Render, distribuição por GitHub Releases e atualização automática do desktop.

## Verificação

```sh
npm run check
npm run build
```

Os testes de integração iniciam um MongoDB replica set temporário e precisam baixar o binário na primeira execução. Não usam Atlas nem dados reais. Os testes de navegador usam mídia sintética; verifique também áudio, captura, permissões e TURN em computadores reais.

## Gerar os aplicativos desktop

Antes de distribuir, defina a origem HTTPS pública e a rota de atualizações. Todos os instaladores são gravados em `dist/` na raiz do monorepo.

```sh
# Substitua pela origem real do backend, sem /api no final:
export VITE_API_URL=https://SEU-SERVICO.onrender.com
export ORBIT_UPDATE_URL=https://SEU-SERVICO.onrender.com/downloads

# Compila shared, servidor, renderer, main e preload sem empacotar:
npm run build

# macOS: gera DMG e ZIP de atualização para Intel e Apple Silicon:
npm run build:mac

# Uma arquitetura específica ou um único app universal:
npm run build:mac:arm64
npm run build:mac:x64
npm run build:mac:universal

# Windows x64: gera Orbit-Setup-0.1.0-x64.exe (NSIS):
npm run build:win
```

Os comandos de instalador recusam `api.example.com`, localhost, HTTP, caminhos e outros placeholders. `ORBIT_UPDATE_URL` precisa ser exatamente a rota `/downloads` dessa API. O Blueprint deixa `REGISTRATION_ENABLED=true` para que a criação de contas funcione; mude para `false` no painel quando quiser fechar novos cadastros.

Gere DMGs em um Mac; gere o instalador NSIS preferencialmente no Windows. O build universal é viável enquanto as dependências permanecerem JavaScript puro; valide novamente se forem adicionados módulos nativos. O nome, versão e identificador vêm de `apps/desktop/package.json` e `apps/desktop/electron-builder.yml` (`Orbit`, `0.1.0`, `app.orbit.desktop`).

O build local pode ser não assinado. Para assinatura futura do macOS, injete `CSC_LINK` e `CSC_KEY_PASSWORD` no shell ou nos secrets do CI. Para assinar e notarizar automaticamente com uma chave da App Store Connect, injete também `APPLE_API_KEY` (caminho para o `.p8`), `APPLE_API_KEY_ID` e `APPLE_API_ISSUER`. Como alternativa, o `electron-builder` aceita `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID`. No Windows, use `WIN_CSC_LINK` e `WIN_CSC_KEY_PASSWORD`. Nunca grave certificados, senhas ou chaves `.p8` no repositório ou em variáveis `VITE_*`.

No macOS, permita Microfone e Gravação de Tela em **Ajustes do Sistema > Privacidade e Segurança**. Se uma permissão tiver sido negada ou alterada, o Orbit mostra a orientação e um atalho para os Ajustes; reinicie o aplicativo depois da alteração. Áudio do sistema exige macOS 14.2 ou mais recente e o pacote instalado. No Windows, a captura de tela usa o seletor do Orbit e o loopback de áudio; a permissão global de microfone fica em **Configurações > Privacidade e segurança > Microfone**.

O renderer continua sem Node: `contextIsolation`, sandbox e `webSecurity` permanecem ativos, `nodeIntegration` permanece desativado e o preload expõe somente operações IPC específicas. Informações de plataforma, arquitetura e versão são obtidas no processo principal e retornadas como dados somente leitura.

## Publicação contínua

O `render.yaml` usa `/health/ready` e o plano gratuito do Render. Nesse plano, o serviço pode suspender após períodos sem tráfego e a primeira conexão seguinte pode demorar; disponibilidade contínua exige um plano pago. Depois do CI e dos builds nativos passarem, o workflow `Publish desktop` aciona o deploy do SHA testado pelo hook do Render, confirma esse SHA no `/health/live` e só então publica Intel, Apple Silicon, universal e Windows em uma GitHub Release incremental. O app consulta a rota segura `/downloads` a cada quatro horas, baixa uma atualização compatível em segundo plano e pede para reiniciar quando ela estiver pronta.

Para ativar o fluxo, conecte um repositório GitHub ao Render e configure no GitHub a variável de repositório `ORBIT_PRODUCTION_API_URL` com a URL `https://...onrender.com` e o secret `RENDER_DEPLOY_HOOK_URL` copiado das configurações do serviço. Em repositório privado, adicione no Render `GITHUB_RELEASE_TOKEN` com acesso somente de leitura a Contents; em repositório público ele não é necessário. Certificados permanecem opcionais e entram somente pelos secrets documentados em [Desenvolvimento e deploy](docs/DEPLOYMENT.md).

Downloads estáveis ficam disponíveis em `GET /downloads` e nos atalhos `/downloads/latest/mac-arm64`, `/downloads/latest/mac-x64`, `/downloads/latest/mac-universal` e `/downloads/latest/windows`. Em repositórios públicos, esses endpoints usam o redirecionamento estável `releases/latest` do GitHub, sem depender da cota da API pública. Nenhum instalador em `dist/` local é publicado automaticamente; a fonte global é sempre a Release criada pelo CI.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Permissões](docs/PERMISSIONS.md)
- [Segurança](docs/SECURITY.md)
- [Desenvolvimento, Render, Atlas e TURN](docs/DEPLOYMENT.md)
- [Estado e validações](docs/PROJECT_STATE.md)
- [Variáveis de ambiente](.env.example)

Recuperação de senha tem endpoint/modelo preparados, sem envio de e-mail. Uploads e SFU não estão habilitados. Assinatura exige certificados do proprietário; sem eles, o CI ainda produz instaladores não assinados para teste. A mídia em malha tem limites de banda; TURN externo é necessário para confiabilidade entre redes. Áudio de sistema no macOS requer validação específica da versão do SO/Electron; veja a documentação de deploy.

Para testar três clientes e transmissões locais com mídia sintética:

```sh
npx playwright install chromium
npm run test:e2e
```

O teste inicia sua própria API e replica set descartável nas portas `E2E_API_URL`/`E2E_DESKTOP_URL`. No macOS com Chrome instalado, pode usar `E2E_BROWSER_CHANNEL=chrome npm run test:e2e`. Não execute alterações/build simultaneamente aos testes. Para verificar Electron, mantenha a interface dev em execução e use `npm run test:electron` após `npm run build`.
