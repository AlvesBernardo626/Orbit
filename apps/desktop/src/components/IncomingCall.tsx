import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import type { Conversation, User } from '@orbit/shared';
import callRingtone from '../assets/call-ringtone.mp3';
import { Avatar } from './ui';

export function IncomingCallCard({
  caller,
  conversation,
  onAccept,
  onDecline,
}: {
  caller: User;
  conversation: Conversation;
  onAccept: () => void;
  onDecline: () => Promise<void>;
}) {
  const [responding, setResponding] = useState(false);
  const acceptButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const ringtone = new Audio(callRingtone);
    ringtone.loop = true;
    ringtone.volume = 0.55;
    void ringtone.play().catch(() => undefined);
    acceptButton.current?.focus();
    return () => {
      ringtone.pause();
      ringtone.currentTime = 0;
    };
  }, []);

  return (
    <div className="incoming-call-backdrop">
      <aside
        className="incoming-call"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incoming-call-title"
      >
        <div className="incoming-call-pulse">
          <Avatar user={caller} size="large" />
        </div>
        <div className="incoming-call-copy">
          <span className="eyebrow">CHAMADA DE VOZ RECEBIDA</span>
          <h2 id="incoming-call-title">{caller.displayName}</h2>
          <p>
            {conversation.kind === 'group'
              ? `está chamando você em ${conversation.name}`
              : `@${caller.username} está ligando para você`}
          </p>
        </div>
        <div className="incoming-call-actions">
          <button
            ref={acceptButton}
            className="accept-call"
            disabled={responding}
            aria-label="Atender chamada"
            onClick={onAccept}
          >
            <Phone size={21} />
            <span>Atender</span>
          </button>
          <button
            className="decline-call"
            disabled={responding}
            aria-label="Recusar chamada"
            onClick={() => {
              setResponding(true);
              void onDecline().finally(() => setResponding(false));
            }}
          >
            <PhoneOff size={21} />
            <span>Recusar</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
