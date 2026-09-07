# Arquitetura

Orbit é um monorepo npm com três pacotes: `apps/desktop`, `apps/server` e `packages/shared`.

O desktop usa React para UI e Electron para integração com o SO. O renderer é sandboxed, sem Node, sem navegação externa e com CSP. O main process expõe apenas autenticação e seleção de fonte de captura. Refresh tokens são criptografados por safeStorage; o renderer mantém somente access token em memória. Não há localStorage de credenciais. O build recebe somente URLs públicas.

O servidor é um monólito modular Express com REST para operações persistentes e Socket.IO para presença, digitação, atualizações e signaling. Cada evento valida sessão, payload e participação. Eventos persistentes são enviados após confirmação no MongoDB; reconnect recarrega o estado pela API. MongoDB usa documentos de mensagem individuais e paginação por cursor `_id`, nunca arrays infinitos.

Uma instância Render mantém presença e chamadas em memória. Reinício desconecta sockets; o cliente autentica novamente, recarrega o estado e reconstrói a chamada. Não configurar mais de uma réplica sem Redis/adapter, rate limiter distribuído e estado compartilhado de chamadas. Uma instância sempre ativa evita cold starts.

A mídia inicial é uma malha WebRTC P2P limitada a 8 participantes. Captura, microfone e transporte são separados da UI. `MediaTransport` é a fronteira para substituir malha por LiveKit/mediasoup. A regra legada sugeria LiveKit, mas o pedido atual define signaling por Socket.IO e aceita P2P para grupos pequenos. Nenhum secret de TURN fica no build; o backend emite credenciais coturn temporárias.

Somente Windows e macOS são alvos de distribuição. O navegador em modo desenvolvimento é útil para verificar UI e duas sessões, sem persistência de login.
