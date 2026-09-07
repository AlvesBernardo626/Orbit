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
- Perfil editável, avatar/banner por URL HTTPS, bio e status.
- Solicitações, amizades, bloqueio e DMs com histórico, edição, exclusão, digitação, não lidas e paginação.
- Grupos de até 8 pessoas, proprietário/administradores/membros, transferência de propriedade e moderação.
- Presença e eventos via Socket.IO com autorização no servidor.
- Voz P2P, mute, troca de microfone/saída, detecção de fala e recuperação de conexão.
- Escolha de tela/janela, transmissão com presets 720p/15, 1080p/30 e 1080p/60, controle de bitrate e encerramento da captura.
- Docker, CI, Blueprint Render, health checks e índices MongoDB.

## Verificação

```sh
npm run check
npm run build
```

Os testes de integração iniciam um MongoDB replica set temporário e precisam baixar o binário na primeira execução. Não usam Atlas nem dados reais. Os testes de navegador usam mídia sintética; verifique também áudio, captura, permissões e TURN em computadores reais.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Permissões](docs/PERMISSIONS.md)
- [Segurança](docs/SECURITY.md)
- [Desenvolvimento, Render, Atlas e TURN](docs/DEPLOYMENT.md)
- [Estado e validações](docs/PROJECT_STATE.md)
- [Variáveis de ambiente](.env.example)

Recuperação de senha tem endpoint/modelo preparados, sem envio de e-mail. Uploads, SFU, atualização automática, assinatura de instaladores e publicação externa não estão habilitados. A mídia em malha tem limites de banda; TURN externo é necessário para confiabilidade entre redes. Áudio de sistema no macOS requer validação específica da versão do SO/Electron; veja a documentação de deploy.

Para testar três clientes e transmissões locais com mídia sintética:

```sh
npx playwright install chromium
npm run test:e2e
```

O teste inicia sua própria API e replica set descartável nas portas `E2E_API_URL`/`E2E_DESKTOP_URL`. No macOS com Chrome instalado, pode usar `E2E_BROWSER_CHANNEL=chrome npm run test:e2e`. Não execute alterações/build simultaneamente aos testes. Para verificar Electron, mantenha a interface dev em execução e use `npm run test:electron` após `npm run build`.
