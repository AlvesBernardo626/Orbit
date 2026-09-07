import type { CallPeer } from '@orbit/shared';
export interface Quality {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}
export const qualities: Record<string, Quality> = {
  economy: { width: 1280, height: 720, fps: 15, bitrate: 1000000 },
  balanced: { width: 1920, height: 1080, fps: 30, bitrate: 2500000 },
  fluid: { width: 1920, height: 1080, fps: 60, bitrate: 4000000 },
};
export interface RemoteMedia {
  socketId: string;
  voice: MediaStream;
  screen: MediaStream;
  state: RTCPeerConnectionState;
}
export interface CallSnapshot {
  conversationId: string | null;
  phase: 'idle' | 'joining' | 'connected' | 'reconnecting';
  peers: CallPeer[];
  remote: RemoteMedia[];
  localScreen: MediaStream | null;
  muted: boolean;
  sharing: boolean;
  error: string;
  microphone: MediaStream | null;
}
/** SFU adapters implement this interface; UI never owns PeerConnections or signaling. */
export interface MediaTransport {
  subscribe(fn: () => void): () => void;
  snapshot(): CallSnapshot;
  join(conversationId: string, deviceId?: string, announce?: boolean): Promise<void>;
  leave(): void;
  mute(value: boolean): void;
  setMicrophone(deviceId: string): Promise<void>;
  share(stream: MediaStream, quality: Quality): Promise<void>;
  stopSharing(): Promise<void>;
  dispose(): void;
}
