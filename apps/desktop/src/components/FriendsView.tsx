import { useState, type FormEvent } from 'react';
import { Check, MessageCircle, UserPlus, Users, X, ArrowUpRight } from 'lucide-react';
import type { Bootstrap, User } from '@orbit/shared';
import { usernameSchema } from '@orbit/shared';
import { mutation } from '../lib/api';
import { Avatar, Empty, Modal, Field, statusLabel } from './ui';
export function FriendsView({
  data,
  onOpen,
  onProfile,
  onRefresh,
  onError,
}: {
  data: Bootstrap;
  onOpen: (id: string) => void;
  onProfile: (u: User) => void;
  onRefresh: () => void;
  onError: (s: string) => void;
}) {
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const accepted = data.friends.filter((f) => f.state === 'accepted');
  const pending = data.friends.filter((f) => f.state === 'pending');
  const list = (filter === 'pending' ? pending : accepted)
    .filter((f) => filter !== 'online' || f.user.status !== 'offline')
    .filter((f) =>
      `${f.user.displayName} ${f.user.username}`.toLowerCase().includes(search.toLowerCase()),
    );
  async function act(id: string, action: string) {
    try {
      await mutation(`/friends/${id}/${action}`);
      onRefresh();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function dm(id: string) {
    try {
      const result = await mutation<{ id: string }>('/conversations/dm', { userId: id });
      onRefresh();
      onOpen(result.id);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = usernameSchema.safeParse(new FormData(e.currentTarget).get('username'));
    if (!parsed.success) {
      onError('Use de 3 a 24 letras, números ou sublinhado.');
      return;
    }
    setBusy(true);
    try {
      await mutation('/friends', { username: parsed.data });
      setAdding(false);
      onRefresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-header">
        <div className="heading-icon">
          <Users size={20} />
          <h2>Amigos</h2>
        </div>
        <button className="primary compact" onClick={() => setAdding(true)}>
          <UserPlus size={16} />
          Adicionar amigo
        </button>
      </header>
      <div className="view-scroll">
        <section className="welcome-card">
          <div>
            <span className="eyebrow">BOAS CONVERSAS COMEÇAM AQUI</span>
            <h1>Sua turma, mais perto.</h1>
            <p>
              Um lugar para colocar o papo em dia.
              <br />
              Ou simplesmente fazer companhia.
            </p>
            <button onClick={() => setAdding(true)}>
              Traga alguém para sua órbita <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="welcome-orbit" aria-hidden="true">
            <i />
            <i />
            <span>✳</span>
            <b>oi.</b>
          </div>
        </section>
        <div className="friends-toolbar">
          <div className="tabs">
            {[
              ['all', 'Todos', accepted.length],
              ['online', 'Online', accepted.filter((f) => f.user.status !== 'offline').length],
              ['pending', 'Pedidos', pending.length],
              ['blocked', 'Bloqueados', data.blocked.length],
            ].map(([value, label, count]) => (
              <button
                key={value}
                className={filter === value ? 'selected' : ''}
                onClick={() => setFilter(String(value))}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
          <input
            className="search"
            aria-label="Buscar amigos"
            placeholder="Buscar alguém…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="list-caption">
          {filter === 'blocked' ? 'USUÁRIOS BLOQUEADOS' : 'PESSOAS NA SUA ÓRBITA'}
          <span>{filter === 'blocked' ? data.blocked.length : list.length}</span>
        </div>
        {filter === 'blocked' ? (
          data.blocked.map((u) => (
            <div className="friend-row" key={u.id}>
              <Avatar user={u} />
              <div className="grow">
                <strong>{u.displayName}</strong>
                <p>@{u.username}</p>
              </div>
              <button
                onClick={() =>
                  void mutation(`/blocks/${u.id}`, undefined, 'DELETE')
                    .then(onRefresh)
                    .catch((e) => onError(e.message))
                }
              >
                Desbloquear
              </button>
            </div>
          ))
        ) : list.length ? (
          list.map((f) => (
            <div className="friend-row" key={f.id}>
              <button className="avatar-button" onClick={() => onProfile(f.user)}>
                <Avatar user={f.user} />
              </button>
              <button className="friend-name grow" onClick={() => onProfile(f.user)}>
                <strong>{f.user.displayName}</strong>
                <span>
                  {f.state === 'pending'
                    ? f.incoming
                      ? 'Pedido recebido'
                      : 'Pedido enviado'
                    : f.user.customStatus || statusLabel[f.user.status]}
                </span>
              </button>
              {f.state === 'accepted' ? (
                <>
                  <button
                    className="icon"
                    title="Conversar"
                    aria-label={`Conversar com ${f.user.displayName}`}
                    onClick={() => void dm(f.user.id)}
                  >
                    <MessageCircle size={18} />
                  </button>
                  <button
                    className="icon muted"
                    title="Remover amizade"
                    aria-label="Remover amizade"
                    onClick={() => {
                      if (confirm(`Remover ${f.user.displayName} dos amigos?`))
                        void act(f.id, 'remove');
                    }}
                  >
                    <X size={17} />
                  </button>
                </>
              ) : (
                <>
                  {f.incoming && (
                    <button
                      className="icon green"
                      title="Aceitar"
                      aria-label="Aceitar"
                      onClick={() => void act(f.id, 'accept')}
                    >
                      <Check size={19} />
                    </button>
                  )}
                  <button
                    className="icon"
                    title={f.incoming ? 'Recusar' : 'Cancelar'}
                    aria-label={f.incoming ? 'Recusar' : 'Cancelar'}
                    onClick={() => void act(f.id, f.incoming ? 'decline' : 'cancel')}
                  >
                    <X size={19} />
                  </button>
                </>
              )}
            </div>
          ))
        ) : (
          <Empty
            icon={<Users size={28} />}
            heading={
              filter === 'online'
                ? 'Tudo tranquilo por aqui.'
                : filter === 'pending'
                  ? 'Nenhum pedido por enquanto.'
                  : 'O começo de boas conversas.'
            }
          >
            Adicione um amigo pelo nome de usuário e comece a conversar.
          </Empty>
        )}
      </div>
      {adding && (
        <Modal title="Adicionar amigo" onClose={() => setAdding(false)}>
          <p className="muted">Basta saber o nome de usuário. Sem o @.</p>
          <form onSubmit={add}>
            <Field label="Nome de usuário">
              <input
                name="username"
                placeholder="nome_do_amigo"
                autoFocus
                required
                minLength={3}
                maxLength={24}
              />
            </Field>
            <button className="primary" disabled={busy}>
              Enviar solicitação
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
