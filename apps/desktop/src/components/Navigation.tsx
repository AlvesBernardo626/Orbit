import { Orbit, Users, MessageCircle, Plus, Settings, LogOut, Hash } from 'lucide-react';
import type { Bootstrap, Conversation, User } from '@orbit/shared';
import { Avatar } from './ui';
import { conversationName } from '../lib/conversations';
import { signOut } from '../lib/api';
export function Navigation({
  data,
  active,
  section,
  connected,
  setActive,
  setSection,
  setProfile,
  onCreateGroup,
  onError,
}: {
  data: Bootstrap;
  active: string | null;
  section: 'friends' | 'messages' | 'groups';
  connected: boolean;
  setActive: (id: string | null) => void;
  setSection: (section: 'friends' | 'messages' | 'groups') => void;
  setProfile: (user: User) => void;
  onCreateGroup: () => void;
  onError: (error: string) => void;
}) {
  const dms = data.conversations.filter((c) => c.kind === 'dm');
  const groups = data.conversations.filter((c) => c.kind === 'group');
  const totalUnread = data.conversations.reduce((n, c) => n + c.unread, 0);
  const navConversation = (c: Conversation) => {
    const other = c.members.find((m) => m.user.id !== data.me.id)?.user;
    return (
      <button
        key={c.id}
        className={`conversation-link ${active === c.id ? 'selected' : ''}`}
        onClick={() => {
          setActive(c.id);
          setSection(c.kind === 'group' ? 'groups' : 'messages');
        }}
      >
        {c.kind === 'group' ? (
          <span className="group-avatar">
            {c.image ? (
              <img src={c.image} alt="" referrerPolicy="no-referrer" />
            ) : (
              <Hash size={18} />
            )}
          </span>
        ) : (
          <Avatar user={other ?? data.me} size="small" />
        )}
        <span className="truncate">{conversationName(c, data.me.id)}</span>
        {c.unread > 0 && <span className="badge">{c.unread > 99 ? '99+' : c.unread}</span>}
      </button>
    );
  };
  return (
    <>
      <aside className="rail">
        <button
          className="brand-mark"
          aria-label="Orbit início"
          onClick={() => {
            setSection('friends');
            setActive(null);
          }}
        >
          <Orbit size={28} />
        </button>
        <span className="rail-divider" />
        <button
          className={section === 'friends' ? 'selected' : ''}
          title="Amigos"
          aria-label="Amigos"
          onClick={() => {
            setSection('friends');
            setActive(null);
          }}
        >
          <Users size={23} />
        </button>
        <button
          className={section === 'messages' ? 'selected' : ''}
          title="Mensagens"
          aria-label="Mensagens"
          onClick={() => {
            setSection('messages');
            setActive(dms[0]?.id ?? null);
          }}
        >
          <MessageCircle size={23} />
          {totalUnread > 0 && <i />}
        </button>
        <button
          className={section === 'groups' ? 'selected' : ''}
          title="Grupos"
          aria-label="Grupos"
          onClick={() => {
            setSection('groups');
            setActive(groups[0]?.id ?? null);
          }}
        >
          <Hash size={24} />
        </button>
        <div className="grow" />
        <button
          title="Editar perfil"
          aria-label="Editar perfil"
          onClick={() => setProfile(data.me)}
        >
          <Avatar user={data.me} size="small" />
        </button>
      </aside>
      <aside className="sidebar">
        <div className="workspace-title">
          <strong>Seu espaço</strong>
          <span className="workspace-label">PESSOAL</span>
        </div>
        <button
          className={`home-link ${section === 'friends' ? 'selected' : ''}`}
          onClick={() => {
            setSection('friends');
            setActive(null);
          }}
        >
          <Users size={18} />
          Amigos
          <span>
            {
              data.friends.filter((f) => f.state === 'accepted' && f.user.status !== 'offline')
                .length
            }{' '}
            online
          </span>
        </button>
        <div className="sidebar-scroll">
          <div className="sidebar-label">
            <span>MENSAGENS DIRETAS</span>
            <button
              className="icon"
              aria-label="Iniciar conversa"
              onClick={() => {
                setSection('friends');
                setActive(null);
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          {dms.length ? (
            dms.map(navConversation)
          ) : (
            <p className="sidebar-empty">
              As suas conversas começam
              <br />
              na lista de amigos.
            </p>
          )}
          <div className="sidebar-label">
            <span>SEUS GRUPOS</span>
            <button className="icon" aria-label="Criar grupo" onClick={() => onCreateGroup()}>
              <Plus size={16} />
            </button>
          </div>
          {groups.map(navConversation)}
          <button className="new-group" onClick={() => onCreateGroup()}>
            <Plus size={16} />
            Criar um grupo
          </button>
        </div>
        <div className="connection-state">
          <i className={connected ? 'live-dot' : 'offline-dot'} />
          {connected ? 'Tudo conectado' : 'Reconectando ao servidor…'}
        </div>
        <div className="self-panel">
          <button onClick={() => setProfile(data.me)} className="self-info">
            <Avatar user={data.me} size="small" />
            <span>
              <strong>{data.me.displayName}</strong>
              <small>@{data.me.username}</small>
            </span>
          </button>
          <button
            className="icon"
            aria-label="Configurações de perfil"
            onClick={() => setProfile(data.me)}
          >
            <Settings size={17} />
          </button>
          <button
            className="icon"
            aria-label="Sair da conta"
            onClick={() => void signOut().catch((e) => onError(e.message))}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}
