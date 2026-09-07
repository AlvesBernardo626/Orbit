# Security & Threat Model

## Princípios Básicos
- **Security-by-Default**: Nenhuma rota ou ação exposta sem autenticação prévia.
- **Validação Server-Side**: O servidor SEMPRE valida a autorização. Nunca confie em flags enviadas pelo cliente.
- **Identity Derivation**: O ID do usuário e permissões vêm da sessão autenticada, não de payloads na request.

## Electron Security
- `contextIsolation: true`
- `nodeIntegration: false`
- APIs seguras via `preload.ts` (IPC estrito).
- Content Security Policy (CSP).

## Backend Security
- Senhas hasheadas (Argon2id).
- Rate Limiting e proteção contra brute-force.
- Nenhuma secret (`.env`) deve ser exposta ao cliente.
- Proteção contra IDOR: sempre validar `ownerId == session.userId`.

## Privacidade
- Soft e hard deletes dependendo do contexto.
- Remoção de vínculos ao excluir grupos ou contatos.
