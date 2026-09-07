# Deployment Guide

O backend foi preparado para o **Render**.

## Configuração do Serviço Render (Web Service)
- **Environment**: Node
- **Build Command**: `pnpm install && pnpm build` (configurar no root ou `apps/api`)
- **Start Command**: `pnpm start` (no `apps/api`)

## Variáveis de Ambiente Necessárias
- `NODE_ENV=production`
- `PORT=10000`
- `MONGODB_URI=mongodb+srv://...`
- `REDIS_URL=rediss://...`
- `LIVEKIT_URL=wss://...`
- `LIVEKIT_API_KEY=...`
- `LIVEKIT_API_SECRET=...`
- `S3_ENDPOINT=...`
- `S3_ACCESS_KEY=...`
- `S3_SECRET_KEY=...`
- `SESSION_SECRET=...`

## Health Check
- Rota: `GET /health` configurada para monitoramento de disponibilidade.

## Frontend (Electron)
O frontend não será feito deploy para web.
A compilação via `electron-builder` criará `.exe` e `.dmg`. O backend não hospeda os arquivos do frontend.
