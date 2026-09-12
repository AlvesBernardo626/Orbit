import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Orbit, Hash, MessageCircle, PhoneOff } from 'lucide-react';
import type { Conversation, IncomingCall, User } from '@orbit/shared';
import { useSocket } from '../hooks/useSocket';
import { useBootstrap } from '../hooks/useBootstrap';
import { signOut, mutation } from '../lib/api';
import { MeshTransport } from '../media/MeshTransport';
import { FriendsView } from './FriendsView';
import { ChatView } from './ChatView';
import { ProfileModal } from './ProfileModal';
import { GroupModal } from './GroupModal';
import { CallPanel } from './CallPanel';
import { Empty } from './ui';
import { Navigation } from './Navigation';
import { DetailsPanel } from './DetailsPanel';
import { IncomingCallCard } from './IncomingCall';
export default function Workspace() {
  const { socket, connected } = useSocket();
  const { data, error, reload } = useBootstrap(socket);
  const [active, setActive] = useState<string | null>(null);
  const [section, setSection] = useState<'friends' | 'messages' | 'groups'>('friends');
  const [profile, setProfile] = useState<User | null>(null);
  const [group, setGroup] = useState<Conversation | 'new' | null>(null);
  const [toast, setToast] = useState('');
  const [transport, setTransport] = useState<MeshTransport | null>(null);
  const [callView, setCallView] = useState<'expanded' | 'minimized'>('expanded');
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const onError = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    const media = new MeshTransport(socket);
    setTransport(media);
    return () => media.dispose();
  }, [socket]);
  useEffect(() => {
    const incoming = (call: IncomingCall) => setIncomingCall(call);
    const dismiss = ({ conversationId }: { conversationId: string }) =>
      setIncomingCall((current) => (current?.conversationId === conversationId ? null : current));
    const disconnected = () => setIncomingCall(null);
    socket
      .on('call:incoming', incoming)
      .on('call:cancelled', dismiss)
      .on('call:answered', dismiss)
      .on('disconnect', disconnected);
    return () => {
      socket
        .off('call:incoming', incoming)
        .off('call:cancelled', dismiss)
        .off('call:answered', dismiss)
        .off('disconnect', disconnected);
    };
  }, [socket]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  const open = (id: string) => {
    setActive(id);
    setSection(
      data?.conversations.find((c) => c.id === id)?.kind === 'group' ? 'groups' : 'messages',
    );
  };
  if (!data)
    return (
      <div className="splash">
        <Orbit size={40} />
        <p>{error || 'Preparando seu espaço…'}</p>
        {error && <button onClick={() => void reload()}>Tentar novamente</button>}
        <button className="subtle" onClick={() => void signOut()}>
          Sair
        </button>
      </div>
    );
  const selected = data.conversations.find((c) => c.id === active);
  return (
    <div className="workspace">
      <Navigation
        data={data}
        active={active}
        section={section}
        connected={connected}
        setActive={setActive}
        setSection={setSection}
        setProfile={setProfile}
        onCreateGroup={() => setGroup('new')}
        onError={onError}
      />
      <main className="main-panel">
        {transport && (
          <ActiveCall
            transport={transport}
            conversations={data.conversations}
            me={data.me}
            onError={onError}
            callView={callView}
            setCallView={setCallView}
          />
        )}
        <div className="content-panel">
          {selected ? (
            <ChatView
              key={selected.id}
              conversation={selected}
              me={data.me}
              socket={socket}
              onCall={() => {
                if (transport) void transport.join(selected.id);
              }}
              onSettings={() => setGroup(selected)}
              onProfile={setProfile}
              onError={onError}
            />
          ) : section === 'friends' ? (
            <FriendsView
              data={data}
              onOpen={open}
              onProfile={setProfile}
              onRefresh={() => void reload()}
              onError={onError}
            />
          ) : (
            <>
              <header className="page-header">
                <h2>{section === 'groups' ? 'Seus grupos' : 'Mensagens'}</h2>
                {section === 'groups' && (
                  <button className="primary compact" onClick={() => setGroup('new')}>
                    Criar grupo
                  </button>
                )}
              </header>
              <Empty
                icon={section === 'groups' ? <Hash size={30} /> : <MessageCircle size={30} />}
                heading="Um espaço para vocês."
              >
                {section === 'groups'
                  ? 'Crie um grupo e compartilhe bons momentos.'
                  : 'Escolha um amigo para iniciar uma conversa.'}
              </Empty>
            </>
          )}
        </div>
      </main>
      <DetailsPanel data={data} selected={selected} setProfile={setProfile} />
      {profile && (
        <ProfileModal
          user={data.me.id === profile.id ? data.me : profile}
          own={profile.id === data.me.id}
          onClose={() => setProfile(null)}
          onSaved={() => void reload()}
          onBlock={(id) => {
            if (confirm('Bloquear esta pessoa? Isso remove a amizade e encerra chamadas em comum.'))
              void mutation(`/blocks/${id}`)
                .then(() => {
                  setProfile(null);
                  void reload();
                })
                .catch((e) => onError(e.message));
          }}
        />
      )}
      {group && (
        <GroupModal
          data={data}
          conversation={
            group === 'new'
              ? undefined
              : (data.conversations.find((c) => c.id === group.id) ?? group)
          }
          onClose={() => setGroup(null)}
          onDone={(id) => {
            void reload();
            if (id) open(id);
          }}
          onError={onError}
        />
      )}
      {incomingCall &&
        (() => {
          const conversation = data.conversations.find((c) => c.id === incomingCall.conversationId);
          const caller = conversation?.members.find(
            (member) => member.user.id === incomingCall.callerId,
          )?.user;
          if (!conversation || !caller || data.blocked.some((user) => user.id === caller.id))
            return null;
          return (
            <IncomingCallCard
              caller={caller}
              conversation={conversation}
              onAccept={() => {
                setIncomingCall(null);
                setActive(conversation.id);
                setSection(conversation.kind === 'group' ? 'groups' : 'messages');
                if (transport) void transport.join(conversation.id, undefined, false);
              }}
              onDecline={async () => {
                try {
                  const result = (await socket.timeout(5000).emitWithAck('call:decline', {
                    conversationId: conversation.id,
                  })) as { ok: boolean; error?: string };
                  if (!result.ok)
                    throw new Error(result.error || 'Não foi possível recusar a chamada.');
                  setIncomingCall(null);
                } catch (e) {
                  onError((e as Error).message);
                }
              }}
            />
          );
        })()}
      {(toast || error) && (
        <div className="toast" role="alert">
          <span>{toast || error}</span>
          <button aria-label="Fechar aviso" onClick={() => setToast('')}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function ActiveCall({
  transport,
  conversations,
  me,
  onError,
  callView,
  setCallView,
}: {
  transport: MeshTransport;
  conversations: Conversation[];
  me: User;
  onError: (s: string) => void;
  callView: 'expanded' | 'minimized';
  setCallView: (view: 'expanded' | 'minimized') => void;
}) {
  const state = useSyncExternalStore(transport.subscribe, transport.snapshot);
  const previousPhase = useRef(state.phase);
  useEffect(() => {
    if ((previousPhase.current === 'idle' && state.phase !== 'idle') || state.error)
      setCallView('expanded');
    previousPhase.current = state.phase;
  }, [state.phase, state.error, setCallView]);
  const conversation = conversations.find((c) => c.id === state.conversationId);
  if (callView === 'minimized' && (state.phase !== 'idle' || state.error))
    return (
      <div className="call-bar" role="status">
        <i className="live-dot" />
        <span>
          {conversation?.name || 'Chamada de voz'} · {state.peers.length}/8
        </span>
        <button className="subtle" onClick={() => setCallView('expanded')}>
          Voltar à chamada
        </button>
        <button className="danger icon" aria-label="Sair da chamada" onClick={() => transport.leave()}>
          <PhoneOff size={15} />
        </button>
      </div>
    );
  return (
    <CallPanel
      transport={transport}
      conversation={conversation}
      me={me}
      onError={onError}
      onMinimize={() => setCallView('minimized')}
    />
  );
}
