# Segurança e limites

## Implementado

- Validação Zod compartilhada: campos estritos, IDs ObjectId, texto com limites, senhas limitadas também em bytes, URLs HTTPS e envelopes de signaling limitados.
- Senhas bcrypt custo 12. Usuário inexistente usa hash fictício para evitar resposta rápida diferenciada no login. Erros de login são genéricos.
- JWT HS256 de 15 minutos com issuer/audience, expiração e vínculo a sessão persistida. Cada requisição autenticada e cada pacote Socket.IO verifica revogação no banco.
- Refresh opaco aleatório de 384 bits, somente hash SHA-256 persistido; rotação atômica, validade absoluta de 30 dias, detecção de reutilização do token anterior e TTL das sessões. Logout revoga sessão e desconecta os sockets correspondentes. Token inválido/antigo nunca emite acesso.
- O main process Electron guarda refresh criptografado com safeStorage do SO. A escrita usa arquivo temporário/rename e modo restritivo. IPC não oferece leitura do token; somente operações de autenticação validadas. Access token fica em memória. A versão de navegador serve apenas ao desenvolvimento e mantém refresh em memória.
- Rate limiting por IP na API e auth, além de tentativas falhas por username; limite de pacotes/socket. Limites em memória adequados à única instância inicial, não a múltiplas réplicas.
- REST e Socket.IO validam propriedade/participação e relações de bloqueio. IDs do cliente só identificam o recurso: nunca concedem acesso. Transações coordenam amizade/bloqueio e alterações de participantes com mensagens.
- Helmet, CORS por origem exata, JSON até 80 KB, cache desabilitado para API autenticada. Nenhum filtro MongoDB vem diretamente do payload do cliente.
- Texto de mensagens é renderizado pelo React como texto. Não há HTML arbitrário, `dangerouslySetInnerHTML`, Markdown ativo nem preview de links.
- Electron usa sandbox, contextIsolation, nodeIntegration=false, webSecurity, bloqueio de navegação/janelas externas, CSP e verificação de sender/frame no IPC. Captura só usa a fonte explicitamente selecionada, autorização de curta duração e frame principal. Nenhuma captura inicia automaticamente.
- Nenhum request body, senha, JWT, SDP ou candidato ICE é registrado nos logs. Logs de erro incluem somente classe/código genérico, sem URI de banco.

## Operação

A conta criada não possui e-mail verificado. Recuperação é uma extensão preparada (modelo com token hash e TTL, endpoint de resposta uniforme), mas não emite tokens nem simula entrega de e-mail. Uploads de anexos e arquivos arbitrários não estão habilitados; quando adicionados, exigir allowlist de MIME/extensão, assinatura binária, limite de tamanho, chave de objeto aleatória, antivírus quando aplicável e armazenamento privado com autorização.

Novos avatares, banners e imagens de grupo são recortados, redimensionados e convertidos para WebP no cliente antes de serem persistidos. Data URLs aceitas são limitadas a PNG, JPEG e WebP; SVG e formatos executáveis são rejeitados. URLs HTTPS legadas continuam aceitas com `referrerPolicy=no-referrer`; a origem externa pode observar o IP do cliente. Não há proxy de imagem no servidor.

As mensagens são protegidas por TLS em trânsito; não são criptografadas de ponta a ponta no banco. WebRTC protege mídia em trânsito (DTLS-SRTP). P2P pode revelar IPs aos participantes: use `ICE_RELAY_ONLY=true` para forçar TURN. Não prometer anonimato nem criptografia ponta a ponta das mensagens.

Bloqueio encerra as chamadas dos usuários envolvidos para impedir continuidade de mídia e remove a amizade. DMs ficam inacessíveis nas duas direções. Em grupos comuns, as mensagens continuam visíveis. Remover amizade não apaga o histórico.

A segurança da produção depende também de TLS, Atlas Network Access, credenciais mínimas, backups, versões atualizadas, certificados de assinatura e proteção do computador local. Não há auditoria independente ou teste de carga de produção nesta entrega.

## Próximas extensões

SFU, armazenamento de arquivos e recuperação por e-mail devem passar pelas mesmas verificações de autorização. Antes de escalar o backend, substituir presença/chamadas/rate limits em memória por estado compartilhado e adapter apropriado. Limites iniciais: 8 participantes por grupo/chamada, 200 amizades/solicitações, 200 bloqueios, 50 grupos por usuário, 4 sockets por usuário. A lista inicial mostra as 200 conversas mais recentes; paginação de conversas será necessária para usos maiores. Mensagens usam páginas de 50 e nunca são armazenadas como array ilimitado no MongoDB.
