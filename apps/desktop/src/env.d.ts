import type { Session } from '@orbit/shared';
declare global {
  interface Window {
    orbit?: {
      auth(
        action: 'login' | 'register' | 'refresh' | 'logout',
        data?: unknown,
      ): Promise<Session | null>;
      capabilities(): Promise<{ systemAudio: boolean }>;
      sources(): Promise<{ id: string; name: string; thumbnail: string }[]>;
      selectSource(id: string, audio: boolean): Promise<void>;
    };
  }
}
export {};
