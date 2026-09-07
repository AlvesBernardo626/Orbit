import type { Session } from '@orbit/shared';
type PermissionStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
type RuntimeInfo = {
  appId: string;
  version: string;
  platform: string;
  arch: string;
  osVersion: string;
  isPackaged: boolean;
  systemAudio: boolean;
  permissions: {
    microphone: PermissionStatus;
    screen: PermissionStatus;
  };
};
declare global {
  interface Window {
    orbit?: {
      auth(
        action: 'login' | 'register' | 'refresh' | 'logout',
        data?: unknown,
      ): Promise<Session | null>;
      capabilities(): Promise<RuntimeInfo>;
      requestMicrophonePermission(): Promise<PermissionStatus>;
      openSystemSettings(permission: 'microphone' | 'screen' | 'notifications'): Promise<void>;
      sources(): Promise<{ id: string; name: string; thumbnail: string }[]>;
      selectSource(id: string, audio: boolean): Promise<void>;
    };
  }
}
export {};
