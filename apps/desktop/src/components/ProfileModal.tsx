import { useState, type FormEvent } from 'react';
import type { User } from '@orbit/shared';
import { profileSchema } from '@orbit/shared';
import { mutation } from '../lib/api';
import { Avatar, Field, Modal, statusLabel } from './ui';
export function ProfileModal({
  user,
  own,
  onClose,
  onSaved,
  onBlock,
}: {
  user: User;
  own: boolean;
  onClose: () => void;
  onSaved: () => void;
  onBlock?: (id: string) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = profileSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      setError(parsed.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    try {
      await mutation('/me', parsed.data, 'PATCH');
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={own ? 'Seu perfil' : 'Perfil'} onClose={onClose}>
      <div className="profile-banner">
        {user.banner && (
          <img src={user.banner} alt="Banner do perfil" referrerPolicy="no-referrer" />
        )}
      </div>
      <div className="profile-identity">
        <Avatar user={user} size="large" />
        <div>
          <h2>{user.displayName}</h2>
          <span className="muted">
            @{user.username} · {statusLabel[user.status]}
          </span>
        </div>
      </div>
      {own ? (
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label="Nome">
              <input name="displayName" defaultValue={user.displayName} maxLength={48} required />
            </Field>
            <Field label="Usuário">
              <input name="username" defaultValue={user.username} maxLength={24} required />
            </Field>
          </div>
          <Field label="Bio">
            <textarea name="bio" defaultValue={user.bio} maxLength={300} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={user.status}>
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status personalizado">
            <input
              name="customStatus"
              defaultValue={user.customStatus}
              maxLength={80}
              placeholder="O que está acontecendo?"
            />
          </Field>
          <Field label="URL HTTPS do avatar">
            <input
              name="avatar"
              defaultValue={user.avatar}
              placeholder="https://…"
              maxLength={2048}
            />
          </Field>
          <Field label="URL HTTPS do banner">
            <input
              name="banner"
              defaultValue={user.banner}
              placeholder="https://…"
              maxLength={2048}
            />
          </Field>
          <p className="muted small">
            Imagens por URL pública. Upload de arquivos será adicionado em uma próxima versão.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar perfil'}
          </button>
        </form>
      ) : (
        <>
          <p className="bio">{user.bio || 'Ainda sem bio. Um universo para conhecer.'}</p>
          {user.customStatus && <p className="custom-status">{user.customStatus}</p>}
          {onBlock && (
            <button className="danger subtle" onClick={() => onBlock(user.id)}>
              Bloquear usuário
            </button>
          )}
        </>
      )}
    </Modal>
  );
}
