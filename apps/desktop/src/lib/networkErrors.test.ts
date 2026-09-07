import { describe, expect, it } from 'vitest';
import { friendlyNetworkError } from './networkErrors';

describe('friendlyNetworkError', () => {
  it('explica quando o hostname compilado não resolve', () => {
    const error = friendlyNetworkError(
      new Error('net::ERR_NAME_NOT_RESOLVED'),
      'https://api.example.com',
    );
    expect(error.message).toContain('api.example.com');
    expect(error.message).toContain('VITE_API_URL inválida');
  });

  it('orienta iniciar a API local quando a conexão é recusada', () => {
    const error = friendlyNetworkError(
      new Error('net::ERR_CONNECTION_REFUSED'),
      'http://127.0.0.1:3001',
    );
    expect(error.message).toContain('npm run dev');
  });

  it('preserva erros que não são falhas de transporte conhecidas', () => {
    const original = new Error('Falha específica');
    expect(friendlyNetworkError(original, 'https://orbit.example')).toBe(original);
  });
});
