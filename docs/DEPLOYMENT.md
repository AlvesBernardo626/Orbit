# Desenvolvimento e deploy

## Local

Node 24 LTS, npm, Windows/macOS e Docker Desktop. Na raiz:

```sh
npm ci
npm run setup
# MongoDB persistente, local e em replica set (transações exigem replica set):
docker compose up -d --wait
npm run dev
```

O `.env` gerado é ignorado pelo Git. Endpoints públicos ficam em `VITE_API_URL` e `DESKTOP_DEV_URL`. O servidor lê `.env` da raiz via `tsx --env-file`. Sem Docker, use MongoDB Atlas ou, para testes descartáveis, `npm run dev:db` em outro terminal. O banco descartável perde todos os dados ao encerrar.

Se Documents estiver sincronizado pelo iCloud/OneDrive, mantenha o checkout fora da sincronização: arquivos `dataless` em node_modules podem bloquear Node/TypeScript. Dependências são geradas, nunca versionadas.

## MongoDB Atlas

1. Crie um cluster MongoDB 8 com replica set, usuário dedicado à base Orbit e acesso mínimo à base (`readWrite`; criação de índices requer as permissões correspondentes).
2. Libere apenas IPs de saída do serviço Render e o IP de desenvolvimento. Evite liberar a internet inteira.
3. Coloque a URI `mongodb+srv://.../orbit?...` exclusivamente em `MONGODB_URI` no painel Render. Use TLS e senha aleatória. O `JWT_SECRET` é gerado automaticamente pelo Render e nunca é armazenado no repositório.
4. Os índices são criados na inicialização sem `syncIndexes` destrutivo. Também há `npm run db:indexes -w @orbit/server` local. Não apagar/recriar índices automaticamente em produção.
5. Habilite backups e monitore armazenamento/conexões conforme o plano. Mensagens não possuem TTL destrutivo.

## Render

Publique este checkout em um repositório GitHub e importe o Blueprint `render.yaml`. O checkout ainda não possui `remote`; associe o repositório correto sem sobrescrever um remote existente:

```sh
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

O Blueprint configura serviço Docker no plano gratuito, deploy automático desligado, health check `/health/ready` e até 30 segundos para encerramento gracioso. `/health/live` verifica o processo e informa o commit; readiness exige a conexão MongoDB. O deploy é acionado pelo CI somente depois dos testes e builds passarem, sempre com o SHA exato. Configure somente `MONGODB_URI` no painel; o Render gera `JWT_SECRET` automaticamente com alta entropia, e a aplicação recusa chaves de exemplo. O plano gratuito pode suspender o serviço por inatividade e atrasar a primeira conexão seguinte; para disponibilidade contínua, altere `plan` para uma instância paga compatível.

Use plano sempre ativo para evitar cold starts e interrupções de chamadas. A mídia P2P não passa pelo Render; a API hospeda apenas REST/Socket.IO. Não é necessário nem adequado tentar rodar coturn UDP dentro deste serviço web.

Cadastros ficam abertos no Blueprint (`REGISTRATION_ENABLED=true`) para corrigir o fluxo inicial de criação de conta. Depois de criar as contas necessárias, você pode trocar a variável para `false` no painel. Configure `TRUST_PROXY_HOPS` conforme a cadeia real de proxies; não use `true` irrestrito. Configure somente origens exatas em `CORS_ORIGINS`.

Todo serviço web recebe uma URL HTTPS `onrender.com`. Copie essa origem e crie no repositório GitHub a variável Actions `ORBIT_PRODUCTION_API_URL`, sem `/api` ou barra final. Nas configurações do serviço Render, copie o Deploy Hook e grave-o no GitHub como secret `RENDER_DEPLOY_HOOK_URL`. O hook é secreto e nunca deve entrar no código. Se a primeira execução de `Publish desktop` ocorrer antes dessas configurações, defina ambas e reexecute o workflow que falhou.

## STUN / TURN

`STUN_URLS` e `TURN_URLS` aceitam listas separadas por vírgulas. Em redes diferentes, TURN é necessário para confiabilidade (CGNAT, firewalls, UDP bloqueado). Use servidor coturn externo ou provedor compatível com credenciais REST temporárias HMAC-SHA1. Configure `use-auth-secret`, `static-auth-secret` igual a `TURN_SECRET`, realm e certificados TLS; disponibilize UDP, TCP e TLS conforme a rede. O segredo nunca vai para o desktop; `/api/rtc/config` entrega credenciais válidas por uma hora somente para sessões autenticadas. `ICE_RELAY_ONLY=true` força relay e evita revelar IP P2P ao outro participante.

As credenciais são renovadas na entrada/reentrada. Chamadas já estabelecidas usam as alocações existentes; para sessões muito longas, reentrar renova as credenciais. Uma SFU passa a fazer sentido quando 8 participantes ou múltiplas telas em malha não atenderem à banda disponível.

## Desktop de produção

Defina no ambiente do build uma API pública HTTPS e sua rota de atualização. Os artefatos são gravados em `dist/` na raiz:

```sh
export VITE_API_URL=https://SEU-SERVICO.onrender.com
export ORBIT_UPDATE_URL=https://SEU-SERVICO.onrender.com/downloads
npm run build:mac
# Também disponíveis: build:mac:arm64, build:mac:x64 e build:mac:universal.
# Em Windows, configure VITE_API_URL no PowerShell e execute:
npm run build:win
```

Nunca use `VITE_` para MongoDB, JWT, senha ou TURN_SECRET. O endereço da API é configuração pública compilada no main e renderer. Builds de produção recusam API sem HTTPS e carregam a UI via protocolo seguro `orbit://app`.

O validador interrompe o empacotamento quando `VITE_API_URL` contém localhost, domínios `example`, placeholders, caminhos ou uma origem sem HTTPS. `ORBIT_UPDATE_URL` deve usar a mesma origem e terminar em `/downloads`. O exemplo é apenas de formato: confirme no painel Render a URL atribuída ao serviço.

`build:mac` gera DMGs separados e ZIPs de atualização para Intel e Apple Silicon; `build:mac:universal` combina as duas arquiteturas quando não há módulos nativos incompatíveis. `build:win` gera um instalador NSIS x64 e metadados de atualização. O arquivo `apps/desktop/electron-builder.yml` define nome, identificador, ícone, Hardened Runtime, entitlements, metadados do `Info.plist`, nomes dos artefatos e feed genérico HTTPS.

Assinatura e notarização dependem das contas do proprietário. O `electron-builder` assina quando recebe `CSC_LINK` e `CSC_KEY_PASSWORD`, e notariza automaticamente quando também recebe um conjunto completo de credenciais:

```sh
# Recomendado: chave da App Store Connect
export CSC_LINK=/caminho/DeveloperIDApplication.p12
export CSC_KEY_PASSWORD='fornecida-pelo-secret-manager'
export APPLE_API_KEY=/caminho/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
npm run build:mac:arm64
```

Também é suportado o conjunto `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID`. Use secrets do CI ou variáveis do shell; não salve os valores no repositório, em `.env.example` ou sob o prefixo `VITE_`. Sem certificado, o build local continua possível e gera um DMG não assinado apenas para testes internos.

Para assinar o instalador Windows, forneça `WIN_CSC_LINK` e `WIN_CSC_KEY_PASSWORD` como secrets no ambiente do build Windows. A ausência dessas variáveis mantém o fluxo local não assinado.

## Releases globais e atualização automática

Após cada `push` em `main`, `Quality` executa tipos, lint, testes e build. Se ele passar, `Publish desktop` usa runners nativos de macOS e Windows, calcula uma versão `major.minor.numero-do-workflow`, cria DMG/ZIP para x64, arm64 e universal e cria EXE NSIS x64. Com os instaladores prontos, o workflow aciona o Deploy Hook com o SHA testado. O Render conserva a versão anterior se o build ou readiness falhar; a Release só é marcada como latest depois que `/health/live` confirmar o mesmo SHA.

Configure estes secrets no GitHub quando estiverem disponíveis:

- macOS: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`;
- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.

`APPLE_API_KEY_P8` contém o conteúdo da chave; o workflow cria um arquivo temporário no runner e não o adiciona ao repositório. Builds sem secrets são permitidas, mas sistemas operacionais podem exibir alertas e a atualização automática assinada precisa ser homologada antes de distribuição ampla.

A API usa `RENDER_GIT_REPO_SLUG` automaticamente para localizar a Release. `GET /downloads` lista os instaladores atuais e `/downloads/<arquivo>` serve também `latest.yml` e `latest-mac.yml`. Em repositório público, a API redireciona para o GitHub. Em repositório privado, configure no Render `GITHUB_RELEASE_TOKEN` com permissão fina somente `Contents: read`; a API transmite os arquivos e suporta requisições parciais sem revelar o token. `DESKTOP_RELEASE_REPOSITORY=owner/repository` permite sobrescrever o slug quando as releases estiverem em outro repositório.

## Verificação antes de distribuição

Execute `npm run check`, `npm run build` e teste dois computadores reais em redes diferentes com TURN. Teste permissões de microfone/tela, hot unplug, mute, troca de saída, encerramento da janela compartilhada, suspensão do sistema e reconexão. Teste o instalador em Windows e macOS. Testes automatizados de signaling não substituem áudio/vídeo e permissões reais do SO.

Referências: [WebSockets no Render](https://render.com/docs/websocket), [health checks](https://render.com/docs/health-checks), [segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security), [captura de mídia](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts).

## Áudio de sistema no macOS

O pacote inclui `NSAudioCaptureUsageDescription`. Em macOS 14.2+ o runtime habilita loopback em builds empacotados; o usuário ainda deve conceder a permissão solicitada pelo SO. No desenvolvimento não empacotado, a opção fica desabilitada porque o aplicativo Electron hospedeiro pode não possuir a chave necessária. A API de captura/versão Chromium e as permissões reais precisam ser homologadas no pacote assinado; o teste sintético não comprova captura nativa. Veja [limitações de desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer#macos-versions-142-or-higher).

O pacote também declara `NSMicrophoneUsageDescription` e `NSScreenCaptureUsageDescription`. Antes de abrir fontes de tela, o processo principal consulta o TCC; em caso de negação, o renderer orienta **Ajustes do Sistema > Privacidade e Segurança > Gravação de Tela** e oferece um atalho limitado a essa tela. O microfone usa `askForMediaAccess` somente após ação do usuário. Permissões alteradas no painel podem exigir reinicialização do Orbit. Notificações web, se habilitadas pela aplicação, passam pela whitelist de origem do `session`; o Orbit atualmente não dispara notificações nativas.
