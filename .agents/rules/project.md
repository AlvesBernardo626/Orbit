# Workspace Rules

- **TypeScript Strict**: Obrigatório.
- **Plataformas**: Apenas Windows e macOS (Electron seguro, `contextIsolation: true`, `nodeIntegration: false`).
- **Infraestrutura**: Render como ambiente principal da API. MongoDB para dados persistentes. LiveKit para mídia. Socket.IO para realtime textual.
- **Segurança**: Backend SEMPRE valida autorização. Nunca exponha secrets (`.env`) no repositório ou no client Electron.
- **Localhost**: Apenas para development. Não faça hardcode de domínios ou portas de dev no código.
- **Testes**: Rodar testes e quality gates antes de concluir qualquer fase.
- **Escopo**: Não refatorar partes não relacionadas. Atualizar sempre `PROJECT_STATE.md` após modificações.
