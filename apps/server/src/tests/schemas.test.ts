import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  messageSchema,
  profileSchema,
  signalSchema,
  canManage,
} from '@orbit/shared';
describe('contratos e permissões', () => {
  it('normaliza usuário e rejeita objetos de consulta', () => {
    expect(
      registerSchema.parse({
        username: ' Alice ',
        displayName: 'Alice',
        password: 'long-password-123',
      }).username,
    ).toBe('alice');
    expect(
      registerSchema.safeParse({
        username: { $ne: null },
        displayName: 'x',
        password: 'long-password-123',
      }).success,
    ).toBe(false);
  });
  it('respeita o limite em bytes do bcrypt', () =>
    expect(
      registerSchema.safeParse({ username: 'alice', displayName: 'A', password: '🔒'.repeat(30) })
        .success,
    ).toBe(false));
  it('rejeita privilégios e URLs executáveis no perfil', () => {
    expect(profileSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(profileSchema.safeParse({ avatar: 'javascript:alert(1)' }).success).toBe(false);
  });
  it('limita mensagens e envelopes de signaling', () => {
    expect(
      messageSchema.safeParse({ content: 'x'.repeat(4001), clientId: crypto.randomUUID() }).success,
    ).toBe(false);
    expect(
      signalSchema.safeParse({
        to: 's',
        description: { type: 'offer', sdp: 'a' },
        candidate: { candidate: 'b' },
      }).success,
    ).toBe(false);
  });
  it('administradores só gerenciam membros', () => {
    expect(canManage('admin', 'owner')).toBe(false);
    expect(canManage('admin', 'admin')).toBe(false);
    expect(canManage('admin', 'member')).toBe(true);
    expect(canManage('member', 'member')).toBe(false);
  });
});
