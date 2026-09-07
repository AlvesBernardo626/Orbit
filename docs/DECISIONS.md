# Architectural Decisions (ADRs)

## ADR-001 — Electron para Windows/macOS
**Contexto**: O aplicativo foca em desktop real com recursos do SO.
**Decisão**: Usar Electron (Vite + React).
**Motivo**: Acesso a APIs nativas (screen capture, atalhos, sistema de bandeja), portabilidade.

## ADR-002 — MongoDB como banco principal
**Contexto**: Persistência de mensagens, usuários e configurações.
**Decisão**: MongoDB (orientado a documentos).
**Motivo**: Flexibilidade no schema para mensagens complexas, facilidade em criar réplicas/sharding no Atlas.

## ADR-003 — Render para API
**Contexto**: Hospedagem da aplicação Node.js.
**Decisão**: Deploy no Render como ambiente principal de produção.
**Motivo**: PaaS simples, suporte a variáveis de ambiente e health checks, CI/CD fácil.

## ADR-004 — LiveKit para mídia
**Contexto**: Funcionalidade de chamada de áudio, vídeo e screen sharing.
**Decisão**: Usar ecossistema LiveKit ao invés de SFU próprio.
**Motivo**: Escalabilidade, estabilidade cross-platform e abstração limpa sobre WebRTC.

## ADR-005 — Socket.IO para realtime textual
**Contexto**: Chat e atualizações sociais em tempo real.
**Decisão**: Socket.IO.
**Motivo**: Reconexão embutida, fallbacks, namespaces/rooms, familiaridade na stack Node.js.

## ADR-006 — Modular Monolith
**Contexto**: Organização do código do backend.
**Decisão**: Manter tudo num monólito modular.
**Motivo**: Evita a complexidade de rede de microserviços enquanto mantém o código organizado por domínios.
