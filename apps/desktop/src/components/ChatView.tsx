import { conversationName } from '../lib/conversations';
import { emojiCategories } from '../lib/emoji';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Headphones,
  Send,
  MessageCircle,
  Settings,
  Pencil,
  Trash2,
  ArrowDown,
  Smile,
} from 'lucide-react';
import type { Conversation, Message, User } from '@orbit/shared';
import { messageSchema, canManage } from '@orbit/shared';
import type { Socket } from 'socket.io-client';
import { api, mutation } from '../lib/api';
import { Avatar, Empty } from './ui';
export function ChatView({
  conversation,
  me,
  socket,
  onCall,
  onSettings,
  onProfile,
  onError,
}: {
  conversation: Conversation;
  me: User;
  socket: Socket;
  onCall: () => void;
  onSettings: () => void;
  onProfile: (u: User) => void;
  onError: (s: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<Message | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [newBelow, setNewBelow] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastRead = useRef('');
  const lastTyping = useRef(0);
  const requestId = useRef(crypto.randomUUID());
  const emojiRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tick, setTick] = useState(0);
  const cid = conversation.id;
  useEffect(() => {
    if (!emojiOpen) return;
    const close = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [emojiOpen]);
  const scrollBottom = () => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
    nearBottom.current = true;
    setNewBelow(false);
  };
  const mark = useCallback(
    (id: string) => {
      if (document.visibilityState === 'visible' && document.hasFocus() && id > lastRead.current) {
        lastRead.current = id;
        void mutation(`/conversations/${cid}/read`, { messageId: id }).catch(() => {
          lastRead.current = '';
        });
      }
    },
    [cid],
  );
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const result = await api<{ messages: Message[]; nextCursor: string | null }>(
          `/conversations/${cid}/messages`,
          { signal },
        );
        if (signal?.aborted) return;
        setMessages(result.messages);
        setCursor(result.nextCursor);
        if (result.messages.length) mark(result.messages.at(-1)!.id);
        requestAnimationFrame(scrollBottom);
      } catch (e) {
        if (!signal?.aborted) onError((e as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [cid, mark, onError],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const receive = (m: Message) => {
      if (m.conversationId !== cid) return;
      setMessages((previous) => {
        const exists = previous.some((p) => p.id === m.id);
        return (exists ? previous.map((p) => (p.id === m.id ? m : p)) : [...previous, m])
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(-500);
      });
      if (nearBottom.current) {
        mark(m.id);
        requestAnimationFrame(scrollBottom);
      } else setNewBelow(true);
    };
    const reconnect = () => void load(controller.signal);
    const typer = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (conversationId === cid) setTyping((t) => ({ ...t, [userId]: Date.now() }));
    };
    socket.on('message', receive).on('typing', typer).on('connect', reconnect);
    const interval = setInterval(() => setTick((t) => t + 1), 1500);
    return () => {
      controller.abort();
      clearInterval(interval);
      socket.off('message', receive).off('typing', typer).off('connect', reconnect);
    };
  }, [cid, load, mark, socket]);
  useEffect(() => {
    const read = () => {
      if (nearBottom.current && messages.length) mark(messages.at(-1)!.id);
    };
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, [messages, mark]);
  async function older() {
    if (!cursor || loading) return;
    setLoading(true);
    const el = list.current;
    const height = el?.scrollHeight ?? 0;
    try {
      const result = await api<{ messages: Message[]; nextCursor: string | null }>(
        `/conversations/${cid}/messages?before=${cursor}`,
      );
      setMessages((m) => [...result.messages, ...m]);
      setCursor(result.nextCursor);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - height;
      });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    const parsed = messageSchema.safeParse({ content: text, clientId: requestId.current });
    if (!parsed.success) return;
    setSending(true);
    try {
      if (editing)
        await mutation(
          `/conversations/${cid}/messages/${editing.id}`,
          { content: parsed.data.content },
          'PATCH',
        );
      else {
        const result = await mutation<Message>(`/conversations/${cid}/messages`, parsed.data);
        setMessages((ms) => (ms.some((m) => m.id === result.id) ? ms : [...ms, result]));
      }
      requestId.current = crypto.randomUUID();
      setText('');
      setEditing(null);
      requestAnimationFrame(scrollBottom);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  const typers = conversation.members
    .filter((m) => m.user.id !== me.id && (typing[m.user.id] ?? 0) > Date.now() - 4500)
    .map((m) => m.user.displayName);
  void tick;
  const actor = conversation.members.find((m) => m.user.id === me.id)?.role ?? 'member';
  return (
    <>
      <header className="page-header">
        <div className="heading-icon">
          <MessageCircle size={20} />
          <div>
            <h2>{conversationName(conversation, me.id)}</h2>
            <span className="muted small">
              {conversation.kind === 'group'
                ? `${conversation.members.length} pessoas · um espaço em comum`
                : 'Mensagem direta'}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button className="primary compact" onClick={onCall}>
            <Headphones size={17} />
            {conversation.kind === 'dm' ? 'Ligar' : 'Entrar na chamada'}
          </button>
          {conversation.kind === 'group' && (
            <button
              className="icon"
              title="Gerenciar grupo"
              aria-label="Gerenciar grupo"
              onClick={onSettings}
            >
              <Settings size={19} />
            </button>
          )}
        </div>
      </header>
      <div
        className="messages"
        ref={list}
        onScroll={() => {
          const el = list.current!;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
          if (nearBottom.current) {
            setNewBelow(false);
            if (messages.length) mark(messages.at(-1)!.id);
          }
        }}
      >
        {cursor && (
          <button className="load-older" disabled={loading} onClick={() => void older()}>
            {loading ? 'Carregando…' : 'Carregar mensagens anteriores'}
          </button>
        )}
        {!loading && !messages.length && (
          <Empty icon={<MessageCircle size={30} />} heading="Toda conversa tem um começo.">
            Este é o seu espaço com {conversationName(conversation, me.id)}. Diga um oi.
          </Empty>
        )}
        {loading && !messages.length && <p className="muted loading">Carregando conversa…</p>}
        {messages.map((m, index) => {
          const user = conversation.members.find((p) => p.user.id === m.authorId)?.user;
          const previous = messages[index - 1];
          const date = new Date(m.createdAt);
          const separator =
            !previous || new Date(previous.createdAt).toDateString() !== date.toDateString();
          const target =
            conversation.members.find((p) => p.user.id === m.authorId)?.role ?? 'member';
          return (
            <div key={m.id}>
              {separator && (
                <div className="date-separator">
                  <span>
                    {date.toLocaleDateString('pt-BR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              )}
              <article className={`message ${m.deletedAt ? 'deleted' : ''}`}>
                <button className="avatar-button" onClick={() => user && onProfile(user)}>
                  <Avatar user={user ?? { displayName: '?', avatar: '', status: 'offline' }} />
                </button>
                <div className="message-body">
                  <div className="message-meta">
                    <button onClick={() => user && onProfile(user)}>
                      {user?.displayName ?? 'Ex-membro'}
                    </button>
                    <time dateTime={m.createdAt} title={date.toLocaleString('pt-BR')}>
                      {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </time>
                    {m.editedAt && <span>editada</span>}
                  </div>
                  <p>{m.deletedAt ? 'Mensagem excluída' : m.content}</p>
                </div>
                {!m.deletedAt && (
                  <div className="message-actions">
                    {m.authorId === me.id && (
                      <button
                        className="icon"
                        title="Editar"
                        aria-label="Editar mensagem"
                        onClick={() => {
                          setEditing(m);
                          setText(m.content);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {(m.authorId === me.id ||
                      (conversation.kind === 'group' && canManage(actor, target))) && (
                      <button
                        className="icon"
                        title="Excluir"
                        aria-label="Excluir mensagem"
                        onClick={() => {
                          if (confirm('Excluir esta mensagem?'))
                            void mutation(
                              `/conversations/${cid}/messages/${m.id}`,
                              undefined,
                              'DELETE',
                            ).catch((e) => onError(e.message));
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </article>
            </div>
          );
        })}
      </div>
      {newBelow && (
        <button className="new-messages" onClick={scrollBottom}>
          <ArrowDown size={14} />
          Novas mensagens
        </button>
      )}
      <div className="composer-area">
        <div className="typing">{typers.length ? `${typers.join(', ')} digitando…` : ' '}</div>
        {editing && (
          <div className="editing">
            Editando mensagem{' '}
            <button
              onClick={() => {
                setEditing(null);
                setText('');
              }}
            >
              Cancelar
            </button>
          </div>
        )}
        <form className="composer" onSubmit={send}>
          <div className="emoji-trigger" ref={emojiRef}>
            <button
              type="button"
              className="icon"
              aria-label="Inserir emoji"
              title="Emoji"
              onClick={() => setEmojiOpen((o) => !o)}
            >
              <Smile size={19} />
            </button>
            {emojiOpen && (
              <div className="emoji-popover" role="dialog" aria-label="Selecionar emoji">
                {emojiCategories.map((cat) => (
                  <div key={cat.label} className="emoji-category">
                    <span className="emoji-category-label">{cat.label}</span>
                    <div className="emoji-grid">
                      {cat.emoji.map((e, i) => (
                        <button
                          type="button"
                          key={cat.label + i}
                          className="emoji-button"
                          onClick={() => {
                            setText((t) => t + e);
                            setEmojiOpen(false);
                            requestAnimationFrame(() => textareaRef.current?.focus());
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <textarea
            ref={textareaRef}
            aria-label="Mensagem"
            value={text}
            maxLength={4000}
            placeholder={`Conversar com ${conversationName(conversation, me.id)}…`}
            onChange={(e) => {
              setText(e.target.value);
              if (socket.connected && Date.now() - lastTyping.current > 1800) {
                lastTyping.current = Date.now();
                socket.timeout(3000).emit('typing', { conversationId: cid }, () => undefined);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!sending) void send(e);
              }
            }}
          />
          <button
            className="send"
            aria-label={editing ? 'Salvar edição' : 'Enviar mensagem'}
            disabled={sending || !text.trim()}
          >
            <Send size={19} />
          </button>
        </form>
        <div className="composer-hint">
          <span>Enter para enviar · Shift + Enter para nova linha</span>
          <span>{text.length}/4000</span>
        </div>
      </div>
    </>
  );
}
