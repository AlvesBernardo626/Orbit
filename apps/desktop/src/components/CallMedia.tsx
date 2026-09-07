import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Monitor, Maximize2 } from 'lucide-react';
import type { CallPeer, User } from '@orbit/shared';
import { useSpeaking } from '../hooks/useSpeaking';
import { Avatar } from './ui';
export function Media({
  stream,
  video = false,
  muted = false,
  output,
}: {
  stream: MediaStream;
  video?: boolean;
  muted?: boolean;
  output: string;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const el = ref.current!;
    let active = true;
    el.srcObject = stream;
    const play = () =>
      void el
        .play()
        .then(() => {
          if (active) setBlocked(false);
        })
        .catch((error: DOMException) => {
          if (active && error.name === 'NotAllowedError') setBlocked(true);
        });
    play();
    stream.addEventListener('addtrack', play);
    const playing = () => setBlocked(false);
    el.addEventListener('playing', playing);
    return () => {
      active = false;
      stream.removeEventListener('addtrack', play);
      el.removeEventListener('playing', playing);
      el.pause();
      el.srcObject = null;
    };
  }, [stream]);
  useEffect(() => {
    const el = ref.current;
    if (el && 'setSinkId' in el)
      void el.setSinkId(output).catch(() => {
        if (output) setBlocked(true);
      });
  }, [output]);
  return (
    <>
      {video ? (
        <video ref={ref} muted={muted} autoPlay playsInline />
      ) : (
        <audio ref={ref} muted={muted} autoPlay />
      )}
      {blocked && (
        <button
          className="play-audio"
          onClick={() =>
            void ref.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setBlocked(true))
          }
        >
          Ativar reprodução
        </button>
      )}
    </>
  );
}
export function Participant({
  peer,
  user,
  stream,
  local,
}: {
  peer: CallPeer;
  user?: User;
  stream: MediaStream | null;
  local: boolean;
}) {
  const speaking = useSpeaking(stream, peer.muted);
  return (
    <div className={`call-person ${speaking ? 'speaking' : ''}`}>
      <Avatar user={user ?? { displayName: '?', avatar: '', status: 'offline' }} size="large" />
      <span>
        {user?.displayName ?? 'Participante'}
        {local ? ' (você)' : ''}
      </span>
      {peer.muted ? <MicOff size={14} /> : <Mic size={14} />}{' '}
      {peer.sharing && <Monitor size={14} className="green" />}
    </div>
  );
}
export function Screen({
  stream,
  title,
  local,
  output,
}: {
  stream: MediaStream;
  title: string;
  local: boolean;
  output: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="screen-tile" ref={ref}>
      <Media stream={stream} video muted={local} output={output} />
      <div>
        <span>
          <i className="live-dot" />
          {title}
        </span>
        <button
          className="icon"
          aria-label="Tela cheia"
          onClick={() => void ref.current?.requestFullscreen()}
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  );
}
