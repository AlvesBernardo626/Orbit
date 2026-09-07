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
3. Coloque a URI `mongodb+srv://.../orbit?...` exclusivamente em `MONGODB_URI` no painel Render. Use TLS e senha aleatória.
4. Os índices são criados na inicialização sem `syncIndexes` destrutivo. Também há `npm run db:indexes -w @orbit/server` local. Não apagar/recriar índices automaticamente em produção.
5. Habilite backups e monitore armazenamento/conexões conforme o plano. Mensagens não possuem TTL destrutivo.

## Render

Importe o repositório e o Blueprint `render.yaml`. Ele configura um serviço Docker, uma instância, porta fornecida pelo ambiente e health check `/health/ready`. `/health/live` verifica o processo; readiness verifica a conexão MongoDB. Configure JWT_SECRET com pelo menos 48 caracteres aleatórios; se o gerador Render fornecer menos, substitua por um segredo gerado localmente. A aplicação recusa a chave de exemplo.

Use plano sempre ativo para evitar cold starts e interrupções de chamadas. A mídia P2P não passa pelo Render; a API hospeda apenas REST/Socket.IO. Não é necessário nem adequado tentar rodar coturn UDP dentro deste serviço web.

Cadastros estão fechados no Blueprint. Abra `REGISTRATION_ENABLED=true` para criar as contas do grupo inicial, depois feche novamente. Configure `TRUST_PROXY_HOPS` conforme a cadeia real de proxies; não use `true` irrestrito. Configure somente origens exatas em `CORS_ORIGINS`.

## STUN / TURN

`STUN_URLS` e `TURN_URLS` aceitam listas separadas por vírgulas. Em redes diferentes, TURN é necessário para confiabilidade (CGNAT, firewalls, UDP bloqueado). Use servidor coturn externo ou provedor compatível com credenciais REST temporárias HMAC-SHA1. Configure `use-auth-secret`, `static-auth-secret` igual a `TURN_SECRET`, realm e certificados TLS; disponibilize UDP, TCP e TLS conforme a rede. O segredo nunca vai para o desktop; `/api/rtc/config` entrega credenciais válidas por uma hora somente para sessões autenticadas. `ICE_RELAY_ONLY=true` força relay e evita revelar IP P2P ao outro participante.

As credenciais são renovadas na entrada/reentrada. Chamadas já estabelecidas usam as alocações existentes; para sessões muito longas, reentrar renova as credenciais. Uma SFU passa a fazer sentido quando 8 participantes ou múltiplas telas em malha não atenderem à banda disponível.

## Desktop de produção

Defina no ambiente do build:

```sh
VITE_API_URL=https://SEU-SERVICO.onrender.com npm run build
npm run dist:mac
# Em Windows, configure VITE_API_URL via PowerShell e execute:
npm run dist:win
```

Nunca use `VITE_` para MongoDB, JWT, senha ou TURN_SECRET. O endereço da API é configuração pública compilada no main e renderer. Builds de produção recusam API sem HTTPS e carregam a UI via protocolo seguro `orbit://app`.

Os scripts geram instaladores DMG e NSIS. Assinatura, notarização Apple e certificados Windows dependem de contas/certificados do proprietário. Configure as variáveis oficiais do electron-builder (`CSC_LINK`, `CSC_KEY_PASSWORD`, credenciais Apple em CI). Esta entrega não publica, assina ou envia instaladores a lojas, e não configura atualização automática.

## Verificação antes de distribuição

Execute `npm run check`, `npm run build` e teste dois computadores reais em redes diferentes com TURN. Teste permissões de microfone/tela, hot unplug, mute, troca de saída, encerramento da janela compartilhada, suspensão do sistema e reconexão. Teste o instalador em Windows e macOS. Testes automatizados de signaling não substituem áudio/vídeo e permissões reais do SO.

Referências: [WebSockets no Render](https://render.com/docs/websocket), [health checks](https://render.com/docs/health-checks), [segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security), [captura de mídia](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts).

## Áudio de sistema no macOS

O pacote inclui `NSAudioCaptureUsageDescription`. Em macOS 14.2+ o runtime habilita loopback em builds empacotados; o usuário ainda deve conceder a permissão solicitada pelo SO. No desenvolvimento não empacotado, a opção fica desabilitada porque o aplicativo Electron hospedeiro pode não possuir a chave necessária. A API de captura/versão Chromium e as permissões reais precisam ser homologadas no pacote assinado; o teste sintético não comprova captura nativa. Veja [limitações de desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer#macos-versions-142-or-higher).
