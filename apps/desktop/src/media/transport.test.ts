import { describe, it, expect, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { MeshTransport } from './MeshTransport';
import { qualities } from './types';
describe('ciclo de vida da mídia', () => {
  it('remove todos os listeners ao desmontar e permite dispose repetido', () => {
    const on = vi.fn();
    const off = vi.fn().mockReturnThis();
    const socket = { on, off, connected: false } as unknown as Socket;
    const transport = new MeshTransport(socket);
    expect(on).toHaveBeenCalledTimes(7);
    transport.dispose();
    transport.dispose();
    expect(off).toHaveBeenCalledTimes(7);
    expect(transport.snapshot().phase).toBe('idle');
  });
  it('encerra captura recebida depois da saída', async () => {
    const socket = {
      on: vi.fn(),
      off: vi.fn().mockReturnThis(),
      connected: false,
    } as unknown as Socket;
    const transport = new MeshTransport(socket);
    const stop = vi.fn();
    await transport.share(
      { getTracks: () => [{ stop }] } as unknown as MediaStream,
      qualities.economy!,
    );
    expect(stop).toHaveBeenCalledOnce();
    expect(transport.snapshot().sharing).toBe(false);
    transport.dispose();
  });
});
