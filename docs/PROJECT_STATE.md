# Project State (Relay)

## Arquitetura
- **Monorepo**: pnpm workspaces
- **Frontend/Desktop**: Electron + React + TypeScript + Vite
- **Backend**: Node.js + TypeScript + Fastify (Modular Monolith)
- **Database**: MongoDB (Mongoose)
- **Realtime Text**: Socket.IO
- **Calls/Screen Share**: LiveKit (WebRTC)
- **Cache/Presence**: Redis (opcional no MVP)
- **Storage**: S3-compatible (MinIO para dev)

## Status e Fase Atual
**Fase Atual**: FASE 2 - Infraestrutura Pública (Concluída) / Preparação FASE 3
**Status**: Render configurado via `render.yaml`, variáveis de ambiente, conectividade cliente-servidor nativo via CORS.

## Funcionalidades Completas
- Nenhum código implementado ainda.

## Pendências e Backlog por Fases
- [x] **FASE 0**: Arquitetura, documentação base e workspace rules.
- [x] **FASE 1**: Foundation (Monorepo, Electron, React, API, MongoDB, configuração, lint, testes).
- [x] **FASE 2**: Infraestrutura pública inicial (preparar Render, envs).
- [ ] **FASE 3**: Auth + Profiles (register, login, sessões).
- [ ] **FASE 4**: Social (amizades, presence).
- [ ] **FASE 5**: Messaging (DMs, grupos, realtime textual).
- [ ] **FASE 6**: Calls (integração LiveKit, áudio/vídeo).
- [ ] **FASE 7**: Screen Sharing (captura de tela/janela, prioridade máxima).
- [ ] **FASE 8**: Windows (validação desktop e permissões).
- [ ] **FASE 9**: macOS (validação desktop e permissões).
- [ ] **FASE 10**: Hardening (segurança, rate limit, performance).
- [ ] **FASE 11**: E2E (Testes de integração finais).
- [ ] **FASE 12**: Production readiness.

## Bugs Conhecidos
- N/A

## Último Checkpoint
- Fase 2 concluída: conectividade e `render.yaml` implementados.

## Decisões Importantes
- Ver `docs/DECISIONS.md`.

## Próximos 3 Passos
1. Concluir commit git da Fase 2.
2. Iniciar Fase 3 (Auth + Profiles).
3. Configurar schema do Mongoose de User/Profile.
