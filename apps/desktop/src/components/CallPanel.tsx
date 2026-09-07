import { Media, Participant, Screen } from './CallMedia';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Mic, MicOff, Monitor, PhoneOff, Settings, Volume2 } from 'lucide-react';
import type { CallPeer, Conversation, User } from '@orbit/shared';
import type { MediaTransport, RemoteMedia } from '../media/types';
import { qualities } from '../media/types';
import { captureScreen } from '../media/capture';
import { Field, Modal } from './ui';
export function CallPanel({
  transport,
  conversation,
  me,
  onError,
}: {
  transport: MediaTransport;
  conversation?: Conversation;
  me: User;
  onError: (s: string) => void;
}) {
  const state = useSyncExternalStore(transport.subscribe, transport.snapshot);
  const [settings, setSettings] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [output, setOutput] = useState('');
  const [mic, setMic] = useState('');
  const [quality, setQuality] = useState('balanced');
  const [audio, setAudio] = useState(false);
  const [systemAudio, setSystemAudio] = useState(!window.orbit);
  useEffect(() => {
    if (window.orbit)
      void window.orbit
        .capabilities()
        .then((c) => setSystemAudio(c.systemAudio))
        .catch(() => setSystemAudio(false));
  }, []);
  const [sources, setSources] = useState<{ id: string; name: string; thumbnail: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () =>
      void navigator.mediaDevices
        .enumerateDevices()
        .then(setDevices)
        .catch(() => undefined);
    update();
    navigator.mediaDevices.addEventListener('devicechange', update);
    return () => navigator.mediaDevices.removeEventListener('devicechange', update);
  }, [state.phase]);
  async function picker() {
    if (state.sharing) {
      await transport.stopSharing();
      return;
    }
    setBusy(true);
    try {
      if (window.orbit) {
        setSources(await window.orbit.sources());
        setSelecting(true);
      } else setSelecting(true);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function share(id?: string) {
    setBusy(true);
    try {
      const stream = await captureScreen(qualities[quality]!, id, audio);
      await transport.share(stream, qualities[quality]!);
      setSelecting(false);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (state.phase === 'idle')
    return state.error ? (
      <div className="call-error" role="alert">
        {state.error}
      </div>
    ) : null;
  const remoteFor = (p: CallPeer): RemoteMedia | undefined =>
    state.remote.find((r) => r.socketId === p.socketId);
  return (
    <section className="call-panel">
      <div className="call-heading">
        <div>
          <i className="live-dot" />
          <strong>
            {state.phase === 'connected'
              ? 'Vocês estão conectados'
              : state.phase === 'reconnecting'
                ? 'Reconectando…'
                : 'Conectando áudio…'}
          </strong>
          <span className="muted">{conversation?.name || 'Chamada de voz'}</span>
        </div>
        <span className="small muted">{state.peers.length}/8 pessoas</span>
      </div>
      <div className="call-people">
        {state.peers.map((peer) => (
          <Participant
            key={peer.socketId}
            peer={peer}
            user={conversation?.members.find((m) => m.user.id === peer.userId)?.user}
            stream={peer.userId === me.id ? state.microphone : (remoteFor(peer)?.voice ?? null)}
            local={peer.userId === me.id}
          />
        ))}
      </div>
      {state.remote.map((remote) => (
        <Media key={remote.socketId} stream={remote.voice} output={output} />
      ))}
      <div className="screens">
        {state.localScreen && (
          <Screen stream={state.localScreen} title="Sua transmissão" local output={output} />
        )}{' '}
        {state.peers
          .filter((p) => p.sharing && p.userId !== me.id)
          .map((p) => {
            const remote = remoteFor(p);
            return remote ? (
              <Screen
                key={p.socketId}
                stream={remote.screen}
                title={`${conversation?.members.find((m) => m.user.id === p.userId)?.user.displayName ?? 'Participante'} está transmitindo`}
                local={false}
                output={output}
              />
            ) : null;
          })}
      </div>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <div className="call-controls">
        <button
          className={state.muted ? 'danger' : ''}
          onClick={() => transport.mute(!state.muted)}
        >
          {state.muted ? <MicOff size={17} /> : <Mic size={17} />}{' '}
          {state.muted ? 'Ativar mic' : 'Silenciar'}
        </button>
        <button
          className={state.sharing ? 'green active' : ''}
          disabled={busy || state.phase !== 'connected'}
          onClick={() => void picker()}
        >
          <Monitor size={17} />
          {state.sharing ? 'Parar transmissão' : 'Compartilhar tela'}
        </button>
        <button
          className="icon"
          aria-label="Dispositivos de áudio"
          onClick={() => setSettings(true)}
        >
          <Settings size={18} />
        </button>
        <button className="danger" onClick={() => transport.leave()}>
          <PhoneOff size={18} />
          Sair
        </button>
      </div>
      {settings && (
        <Modal title="Áudio da chamada" onClose={() => setSettings(false)}>
          <Field label="Microfone">
            <select
              value={mic}
              onChange={(e) => {
                const id = e.target.value;
                void transport
                  .setMicrophone(id)
                  .then(() => setMic(id))
                  .catch((e) => onError(e.message));
              }}
            >
              <option value="">Padrão do sistema</option>
              {devices
                .filter((d) => d.kind === 'audioinput')
                .map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || 'Microfone'}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Saída de áudio">
            <select
              value={output}
              disabled={!('setSinkId' in HTMLMediaElement.prototype)}
              onChange={(e) => setOutput(e.target.value)}
            >
              <option value="">Padrão do sistema</option>
              {devices
                .filter((d) => d.kind === 'audiooutput')
                .map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || 'Saída de áudio'}
                  </option>
                ))}
            </select>
          </Field>
          <p className="muted small">
            <Volume2 size={14} /> Quando a seleção de saída não estiver disponível, use os ajustes
            de som do sistema.
          </p>
        </Modal>
      )}
      {selecting && (
        <Modal title="O que vamos compartilhar?" onClose={() => setSelecting(false)} wide>
          <div className="form-grid">
            <Field label="Qualidade">
              <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                <option value="economy">Econômica · 720p / 15 FPS</option>
                <option value="balanced">Equilibrada · 1080p / 30 FPS</option>
                <option value="fluid">Fluida · 1080p / 60 FPS</option>
              </select>
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                checked={audio}
                disabled={!systemAudio}
                onChange={(e) => setAudio(e.target.checked)}
              />
              Incluir áudio do sistema
            </label>
          </div>
          <p className="muted small">
            O áudio depende da fonte e das permissões do sistema. Disponível no Windows e em builds
            do macOS 14.2 ou mais recente com a permissão de captura de áudio. Seu microfone
            continua independente do áudio da transmissão.
          </p>
          {window.orbit ? (
            <div className="sources">
              {sources.map((source) => (
                <button disabled={busy} key={source.id} onClick={() => void share(source.id)}>
                  <img src={source.thumbnail} alt="" />
                  <span>{source.name}</span>
                </button>
              ))}
              {!sources.length && (
                <p>
                  Sem fontes disponíveis. Verifique a permissão de Gravação de Tela nas
                  configurações do sistema.
                </p>
              )}
            </div>
          ) : (
            <button className="primary" disabled={busy} onClick={() => void share()}>
              Escolher tela ou janela
            </button>
          )}
        </Modal>
      )}
    </section>
  );
}
