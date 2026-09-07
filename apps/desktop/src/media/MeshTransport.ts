import type { Socket } from 'socket.io-client';
import type { CallPeer, IceConfig, Signal } from '@orbit/shared';
import { api } from '../lib/api';
import {
  qualities,
  type CallSnapshot,
  type MediaTransport,
  type Quality,
  type RemoteMedia,
} from './types';
interface Peer {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingAnswer: boolean;
  pending: RTCIceCandidateInit[];
  chain: Promise<void>;
  media: RemoteMedia;
  restart?: ReturnType<typeof setTimeout>;
  attempts: number;
}
const initial = (): CallSnapshot => ({
  conversationId: null,
  phase: 'idle',
  peers: [],
  remote: [],
  localScreen: null,
  muted: false,
  sharing: false,
  error: '',
  microphone: null,
});
export class MeshTransport implements MediaTransport {
  private state = initial();
  private listeners = new Set<() => void>();
  private peers = new Map<string, Peer>();
  private config: IceConfig = { iceServers: [], iceTransportPolicy: 'all' };
  private quality = qualities.balanced!;
  private generation = 0;
  private disposed = false;
  constructor(private socket: Socket) {
    socket.on('call:peers', this.onPeers);
    socket.on('call:signal', this.onSignal);
    socket.on('disconnect', this.onDisconnect);
    socket.on('connect', this.onReconnect);
    socket.on('call:ended', this.onEnded);
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private update(patch: Partial<CallSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private fail = (e: unknown) =>
    this.update({ error: e instanceof Error ? e.message : 'Falha na conexão de mídia' });
  private async emit<T>(event: string, data: unknown): Promise<T> {
    const result = (await this.socket.timeout(10000).emitWithAck(event, data)) as {
      ok: boolean;
      data: T;
      error: string;
    };
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }
  private sync() {
    if (this.socket.connected && this.state.phase === 'connected')
      void this.emit('call:state', { muted: this.state.muted, sharing: this.state.sharing }).catch(
        this.fail,
      );
  }
  async join(conversationId: string, deviceId?: string) {
    this.leave();
    const generation = ++this.generation;
    this.update({ conversationId, phase: 'joining', error: '' });
    let mic: MediaStream | undefined;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (generation !== this.generation) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      this.update({ microphone: mic });
      this.config = await api<IceConfig>('/rtc/config');
      if (generation !== this.generation) return;
      const result = await this.emit<{ peers: CallPeer[] }>('call:join', { conversationId });
      if (generation !== this.generation) return;
      this.update({ phase: 'connected' });
      this.onPeers({ conversationId, peers: result.peers });
      mic.getAudioTracks()[0]!.onended = () => {
        this.mute(true);
        this.fail(new Error('Microfone desconectado. Selecione outro dispositivo.'));
      };
    } catch (e) {
      if (generation === this.generation) {
        this.leave();
        this.fail(e);
      } else mic?.getTracks().forEach((t) => t.stop());
    }
  }
  private onPeers = ({ conversationId, peers }: { conversationId: string; peers: CallPeer[] }) => {
    if (this.state.conversationId !== conversationId) return;
    this.update({ peers });
    for (const id of this.peers.keys())
      if (!peers.some((p) => p.socketId === id)) this.removePeer(id);
    for (const p of peers)
      if (p.socketId !== this.socket.id && !this.peers.has(p.socketId)) this.createPeer(p.socketId);
  };
  private createPeer(id: string) {
    const pc = new RTCPeerConnection(this.config);
    const media: RemoteMedia = {
      socketId: id,
      voice: new MediaStream(),
      screen: new MediaStream(),
      state: 'new',
    };
    const peer: Peer = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      settingAnswer: false,
      pending: [],
      chain: Promise.resolve(),
      media,
      attempts: 0,
    };
    this.peers.set(id, peer);
    const mic = this.state.microphone?.getAudioTracks()[0];
    const video = this.state.localScreen?.getVideoTracks()[0];
    const audio = this.state.localScreen?.getAudioTracks()[0];
    // Only the lower socket ID creates the initial m-lines. The answerer adopts them.
    // Pre-creating transceivers on both sides duplicates them after an initial rollback.
    if ((this.socket.id ?? '') < id) {
      pc.addTransceiver(mic ?? 'audio', {
        direction: 'sendrecv',
        sendEncodings: [{ maxBitrate: 48000 }],
      });
      pc.addTransceiver(video ?? 'video', {
        direction: 'sendrecv',
        sendEncodings: [{ maxBitrate: this.quality.bitrate, maxFramerate: this.quality.fps }],
      });
      pc.addTransceiver(audio ?? 'audio', {
        direction: 'sendrecv',
        sendEncodings: [{ maxBitrate: 96000 }],
      });
    }
    pc.onicecandidate = ({ candidate }) => {
      if (candidate)
        void this.emit('call:signal', { to: id, candidate: candidate.toJSON() }).catch(this.fail);
    };
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== 'stable') return;
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        await this.emit('call:signal', { to: id, description: pc.localDescription });
      } catch (e) {
        if (pc.connectionState !== 'closed') this.fail(e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.ontrack = ({ track, transceiver }) => {
      const slot = pc.getTransceivers().indexOf(transceiver);
      const stream = slot === 0 ? media.voice : media.screen;
      stream.addTrack(track);
      track.onended = () => {
        stream.removeTrack(track);
        this.updateRemote();
      };
      track.onunmute = () => this.updateRemote();
      this.updateRemote();
    };
    pc.onconnectionstatechange = () => {
      media.state = pc.connectionState;
      this.updateRemote();
      if (pc.connectionState === 'connected') {
        peer.attempts = 0;
        clearTimeout(peer.restart);
        void this.bitrate(peer).catch(this.fail);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        clearTimeout(peer.restart);
        peer.restart = setTimeout(() => {
          if (peer.attempts++ < 3 && pc.signalingState !== 'closed') {
            pc.restartIce();
          } else
            this.fail(new Error('Conexão de mídia perdida. Saia e entre novamente na chamada.'));
        }, 4000);
      }
    };
    this.updateRemote();
    return peer;
  }
  private onSignal = (signal: {
    from: string;
    description?: Signal['description'];
    candidate?: Signal['candidate'];
  }) => {
    if (!this.state.conversationId || !this.state.peers.some((p) => p.socketId === signal.from))
      return;
    const peer = this.peers.get(signal.from) ?? this.createPeer(signal.from);
    peer.chain = peer.chain
      .then(async () => {
        const { pc } = peer;
        if (pc.signalingState === 'closed') return;
        if (signal.description) {
          const description = signal.description;
          const ready = !peer.makingOffer && (pc.signalingState === 'stable' || peer.settingAnswer);
          const collision = description.type === 'offer' && !ready;
          const polite = (this.socket.id ?? '') > signal.from;
          peer.ignoreOffer = !polite && collision;
          if (peer.ignoreOffer) return;
          peer.settingAnswer = description.type === 'answer';
          await pc.setRemoteDescription(description);
          peer.settingAnswer = false;
          for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c);
          if (description.type === 'offer') {
            const tracks = [
              this.state.microphone?.getAudioTracks()[0] ?? null,
              this.state.localScreen?.getVideoTracks()[0] ?? null,
              this.state.localScreen?.getAudioTracks()[0] ?? null,
            ];
            await Promise.all(
              pc
                .getTransceivers()
                .slice(0, 3)
                .map(async (t, i) => {
                  t.direction = 'sendrecv';
                  await t.sender.replaceTrack(tracks[i] ?? null);
                }),
            );
            await pc.setLocalDescription();
            await this.emit('call:signal', { to: signal.from, description: pc.localDescription });
          }
        } else if (signal.candidate) {
          if (peer.ignoreOffer) return;
          if (!pc.remoteDescription) peer.pending.push(signal.candidate);
          else await pc.addIceCandidate(signal.candidate);
        }
      })
      .catch((e) => {
        peer.settingAnswer = false;
        if (peer.pc.signalingState !== 'closed') this.fail(e);
      });
  };
  private updateRemote() {
    this.update({ remote: [...this.peers.values()].map((p) => ({ ...p.media })) });
  }
  private removePeer(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    clearTimeout(p.restart);
    p.pc.ontrack = null;
    p.pc.onicecandidate = null;
    p.pc.onnegotiationneeded = null;
    p.pc.onconnectionstatechange = null;
    p.pc.close();
    p.media.voice.getTracks().forEach((t) => t.stop());
    p.media.screen.getTracks().forEach((t) => t.stop());
    this.peers.delete(id);
    this.updateRemote();
  }
  private onDisconnect = () => {
    if (this.state.conversationId) {
      for (const id of this.peers.keys()) this.removePeer(id);
      this.update({ phase: 'reconnecting', peers: [] });
    }
  };
  private onReconnect = () => {
    if (this.state.phase !== 'reconnecting' || !this.state.conversationId) return;
    const generation = this.generation;
    void (async () => {
      this.config = await api<IceConfig>('/rtc/config');
      if (generation !== this.generation) return;
      const conversationId = this.state.conversationId!;
      const { peers } = await this.emit<{ peers: CallPeer[] }>('call:join', { conversationId });
      if (generation !== this.generation) return;
      this.update({ phase: 'connected', error: '' });
      this.onPeers({ conversationId, peers });
      this.sync();
    })().catch((e) => {
      this.leave();
      this.fail(e);
    });
  };
  private onEnded = ({ reason }: { reason: string }) => {
    this.leave();
    this.update({ error: reason });
  };
  mute(value: boolean) {
    this.state.microphone?.getAudioTracks().forEach((t) => {
      t.enabled = !value;
    });
    this.update({ muted: value });
    this.sync();
  }
  async setMicrophone(deviceId: string) {
    if (!this.state.conversationId) return;
    const generation = this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const track = stream.getAudioTracks()[0]!;
    track.enabled = !this.state.muted;
    try {
      await Promise.all(
        [...this.peers.values()].map((p) => p.pc.getTransceivers()[0]?.sender.replaceTrack(track)),
      );
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      throw e;
    }
    this.state.microphone?.getTracks().forEach((t) => t.stop());
    track.onended = () => {
      this.mute(true);
      this.fail(new Error('Microfone desconectado'));
    };
    this.update({ microphone: stream });
  }
  private async bitrate(peer: Peer) {
    const slots = peer.pc.getTransceivers();
    for (const [index, maxBitrate] of [
      [0, 48000],
      [1, Math.floor(this.quality.bitrate / Math.max(1, this.peers.size / 3))],
      [2, 96000],
    ] as const) {
      const sender = slots[index]?.sender;
      if (!sender?.track) continue;
      const p = sender.getParameters();
      if (!p.encodings.length) continue;
      p.encodings[0]!.maxBitrate = maxBitrate;
      if (index === 1) {
        p.encodings[0]!.maxFramerate = this.quality.fps;
        p.degradationPreference = 'maintain-resolution';
      }
      await sender.setParameters(p);
    }
  }
  async share(stream: MediaStream, quality: Quality) {
    if (!this.state.conversationId) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    await this.stopSharing();
    this.quality = quality;
    const video = stream.getVideoTracks()[0];
    if (!video) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('Nenhuma tela selecionada');
    }
    video.contentHint = 'detail';
    video.onended = () => {
      void this.stopSharing().catch(this.fail);
    };
    this.update({ localScreen: stream, sharing: true });
    try {
      await Promise.all(
        [...this.peers.values()].map(async (p) => {
          await p.pc.getTransceivers()[1]?.sender.replaceTrack(video);
          await p.pc.getTransceivers()[2]?.sender.replaceTrack(stream.getAudioTracks()[0] ?? null);
          await this.bitrate(p);
        }),
      );
      this.sync();
    } catch (e) {
      await this.stopSharing();
      throw e;
    }
  }
  async stopSharing() {
    const stream = this.state.localScreen;
    this.update({ localScreen: null, sharing: false });
    stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    await Promise.allSettled(
      [...this.peers.values()].flatMap((p) => [
        p.pc.getTransceivers()[1]?.sender.replaceTrack(null),
        p.pc.getTransceivers()[2]?.sender.replaceTrack(null),
      ]),
    );
    this.sync();
  }
  leave() {
    this.generation++;
    if (this.socket.connected && this.state.conversationId)
      void this.emit('call:leave', {}).catch(() => undefined);
    for (const id of this.peers.keys()) this.removePeer(id);
    this.state.microphone?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.state.localScreen?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.update(initial());
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.leave();
    this.socket
      .off('call:peers', this.onPeers)
      .off('call:signal', this.onSignal)
      .off('disconnect', this.onDisconnect)
      .off('connect', this.onReconnect)
      .off('call:ended', this.onEnded);
    this.listeners.clear();
  }
}
