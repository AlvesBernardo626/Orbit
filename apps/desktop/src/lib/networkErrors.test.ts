import { describe, expect, it } from 'vitest';
import { friendlyNetworkError, readJsonResponse } from './networkErrors';

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

  it('explica quando um endpoint antigo responde HTML', async () => {
    const response = new Response('<!DOCTYPE html><title>Not Found</title>', { status: 404 });
    await expect(readJsonResponse(response, 'https://old-orbit.example/path')).rejects.toThrow(
      'https://old-orbit.example respondeu uma página HTML',
    );
  });

  it('lê respostas JSON válidas', async () => {
    const response = new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    await expect(readJsonResponse<{ status: string }>(response, 'https://orbit.example')).resolves.toEqual(
      { status: 'ok' },
    );
  });
});
