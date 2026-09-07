# Architecture Overview

## Princípios
- Desktop-first (Windows e macOS apenas, sem web pública).
- Arquitetura Orientada ao Servidor (a API é a fonte da verdade).
- Modular Monolith para o backend.

## Stack
- **Desktop/UI**: Electron, React, TypeScript, Vite.
- **Backend**: Node.js, TypeScript, Fastify.
- **Database**: MongoDB, Mongoose/Zod.
- **Realtime**: Socket.IO.
- **Cache/Presença**: Redis.
- **Mídia (Áudio/Vídeo/Tela)**: LiveKit.
- **Storage**: S3-compatible (MinIO local).

## Estrutura do Monorepo
- `apps/desktop/`: Aplicação Electron e interface React.
- `apps/api/`: Backend Fastify.
- `packages/ui/`: Design system e componentes React.
- `packages/shared/`: Tipos, schemas de validação e utilitários.
- `packages/realtime/`: Contratos de eventos Socket.IO.
- `docs/`: Documentação do projeto.

## Ambientes
1. **Development**: Localhost API, Docker (MongoDB, Redis, MinIO).
2. **Test**: Infraestrutura de banco separada, mocks externos.
3. **Production**: Render (API), MongoDB Atlas, Render KV/Redis, LiveKit Cloud, S3.
