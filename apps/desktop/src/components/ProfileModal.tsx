import { useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, Palette, Trash2 } from 'lucide-react';
import type { User } from '@orbit/shared';
import { profileSchema } from '@orbit/shared';
import { mutation } from '../lib/api';
import { prepareProfileImage, type ProfileImageKind } from '../lib/profileImages';
import { Avatar, Field, Modal, statusLabel } from './ui';

const defaultProfileColor = '#7c3aed';

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
  const [uploading, setUploading] = useState<ProfileImageKind | null>(null);
  const [avatar, setAvatar] = useState(user.avatar);
  const [banner, setBanner] = useState(user.banner);
  const [profileColor, setProfileColor] = useState(user.profileColor || defaultProfileColor);
  const validPickerColor = /^#[0-9a-f]{6}$/i.test(profileColor)
    ? profileColor
    : defaultProfileColor;
  const previewUser = { ...user, avatar, banner, profileColor: validPickerColor };

  async function selectImage(kind: ProfileImageKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setUploading(kind);
    try {
      const image = await prepareProfileImage(file, kind);
      if (kind === 'avatar') setAvatar(image);
      else setBanner(image);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = profileSchema.safeParse({
      ...Object.fromEntries(new FormData(e.currentTarget)),
      avatar,
      banner,
      profileColor,
    });
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
      <div
        className="profile-preview"
        style={{ '--profile-color': validPickerColor } as CSSProperties}
      >
        <div className="profile-banner">
          {banner && <img src={banner} alt="Banner do perfil" referrerPolicy="no-referrer" />}
        </div>
        <div className="profile-identity">
          <Avatar user={previewUser} size="large" />
          <div>
            <h2>{user.displayName}</h2>
            <span className="muted">
              @{user.username} · {statusLabel[user.status]}
            </span>
          </div>
        </div>
      </div>
      {own ? (
        <form onSubmit={save}>
          <div className="profile-upload-grid">
            <ImageUpload
              kind="avatar"
              label="Ícone de usuário"
              value={avatar}
              busy={uploading === 'avatar'}
              onChange={selectImage}
              onClear={() => setAvatar('')}
            />
            <ImageUpload
              kind="banner"
              label="Banner do perfil"
              value={banner}
              busy={uploading === 'banner'}
              onChange={selectImage}
              onClear={() => setBanner('')}
            />
          </div>
          <Field label="Cor de fundo do perfil">
            <div className="profile-color-control">
              <span
                className="color-picker-wrap"
                title="Abrir seletor de cores"
                style={{ background: validPickerColor }}
              >
                <Palette size={17} />
                <input
                  aria-label="Selecionar cor de fundo"
                  type="color"
                  value={validPickerColor}
                  onChange={(e) => setProfileColor(e.target.value.toLowerCase())}
                />
              </span>
              <input
                aria-label="Cor hexadecimal do perfil"
                value={profileColor}
                maxLength={7}
                spellCheck={false}
                placeholder="#7c3aed"
                onChange={(e) => setProfileColor(e.target.value.toLowerCase())}
                onBlur={() => {
                  if (!/^#[0-9a-f]{6}$/i.test(profileColor)) setProfileColor(validPickerColor);
                }}
              />
            </div>
          </Field>
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
          <p className="muted small">
            As imagens são recortadas e otimizadas localmente antes do envio. PNG, JPEG ou WebP, até
            12 MB.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy || uploading !== null}>
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

function ImageUpload({
  kind,
  label,
  value,
  busy,
  onChange,
  onClear,
}: {
  kind: ProfileImageKind;
  label: string;
  value: string;
  busy: boolean;
  onChange: (kind: ProfileImageKind, event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div className="profile-upload">
      <span>{label}</span>
      <div className={`upload-preview ${kind}-upload`}>
        {value ? <img src={value} alt={`Prévia: ${label}`} /> : <ImagePlus size={24} />}
      </div>
      <div>
        <label className="upload-button">
          <ImagePlus size={15} />
          {busy ? 'Processando…' : 'Escolher imagem'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(event) => void onChange(kind, event)}
          />
        </label>
        {value && (
          <button type="button" className="icon" aria-label={`Remover ${label}`} onClick={onClear}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
