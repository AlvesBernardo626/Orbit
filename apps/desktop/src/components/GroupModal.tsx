import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { Bootstrap, Conversation } from '@orbit/shared';
import { groupSchema, MAX_MEMBERS, canManage } from '@orbit/shared';
import { mutation } from '../lib/api';
import { prepareProfileImage } from '../lib/profileImages';
import { Modal, Field, Avatar } from './ui';
export function GroupModal({
  data,
  conversation,
  onClose,
  onDone,
  onError,
}: {
  data: Bootstrap;
  conversation?: Conversation;
  onClose: () => void;
  onDone: (id?: string) => void;
  onError: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [image, setImage] = useState(conversation?.image ?? '');
  const role = conversation?.members.find((m) => m.user.id === data.me.id)?.role;
  const manage = !conversation || role === 'owner' || role === 'admin';
  const candidates = data.friends.filter(
    (f) => f.state === 'accepted' && !conversation?.members.some((m) => m.user.id === f.user.id),
  );
  async function run(fn: () => Promise<unknown>, close = false) {
    setBusy(true);
    try {
      await fn();
      onDone();
      if (close) onClose();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (conversation) {
      const parsed = groupSchema.pick({ name: true, image: true }).safeParse({
        name: form.get('name'),
        image,
      });
      if (!parsed.success) {
        onError(parsed.error.issues[0]!.message);
        return;
      }
      await run(() => mutation(`/groups/${conversation.groupId}`, parsed.data, 'PATCH'));
      return;
    }
    const parsed = groupSchema.safeParse({
      name: form.get('name'),
      image,
      members: form.getAll('members'),
    });
    if (!parsed.success) {
      onError(parsed.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    try {
      const r = await mutation<{ conversationId: string }>('/groups', parsed.data);
      onDone(r.conversationId);
      onClose();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      setImage(await prepareProfileImage(file, 'group'));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  const memberAction = (userId: string, action: string) =>
    run(() => mutation(`/groups/${conversation!.groupId}/members`, { userId, action }));
  return (
    <Modal title={conversation ? 'Seu grupo' : 'Criar um grupo'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Nome do grupo">
          <input
            name="name"
            defaultValue={conversation?.name ?? ''}
            required
            maxLength={64}
            disabled={!manage}
          />
        </Field>
        <div className="group-image-field">
          <span>Imagem do grupo</span>
          <div className="group-image-editor">
            <div className="upload-preview group-upload">
              {image ? (
                <img src={image} alt="Prévia da imagem do grupo" />
              ) : (
                <ImagePlus size={26} />
              )}
            </div>
            {manage && (
              <div className="group-image-actions">
                <label className="upload-button">
                  <ImagePlus size={15} />
                  {uploading ? 'Processando…' : image ? 'Trocar imagem' : 'Escolher imagem'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy || uploading}
                    onChange={(event) => void selectImage(event)}
                  />
                </label>
                {image && (
                  <button
                    type="button"
                    className="icon"
                    aria-label="Remover imagem do grupo"
                    onClick={() => setImage('')}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                <small>PNG, JPEG ou WebP · até 12 MB</small>
              </div>
            )}
          </div>
        </div>
        {!conversation && (
          <fieldset>
            <legend>Convide amigos · até {MAX_MEMBERS - 1}</legend>
            {candidates.map((f) => (
              <label className="check-row" key={f.id}>
                <input type="checkbox" name="members" value={f.user.id} />
                <Avatar user={f.user} size="small" />
                {f.user.displayName}
              </label>
            ))}
            {!candidates.length && (
              <p className="muted">Adicione amigos para convidá-los depois.</p>
            )}
          </fieldset>
        )}
        {manage && (
          <button className="primary" disabled={busy || uploading}>
            {conversation ? 'Salvar alterações' : 'Criar grupo'}
          </button>
        )}
      </form>
      {conversation && (
        <>
          <h3>
            Participantes · {conversation.members.length}/{MAX_MEMBERS}
          </h3>
          {conversation.members.map((m) => (
            <div className="group-member" key={m.user.id}>
              <Avatar user={m.user} size="small" />
              <div className="grow">
                <strong>{m.user.displayName}</strong>
                <small>
                  {{ owner: 'Proprietário', admin: 'Administrador', member: 'Membro' }[m.role]}
                </small>
              </div>
              {role === 'owner' && m.role !== 'owner' && (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void memberAction(m.user.id, m.role === 'admin' ? 'member' : 'admin')
                    }
                  >
                    {m.role === 'admin' ? 'Rebaixar' : 'Promover'}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (confirm('Transferir a propriedade para esta pessoa?'))
                        void memberAction(m.user.id, 'transfer');
                    }}
                  >
                    Transferir
                  </button>
                </>
              )}
              {role && canManage(role, m.role) && (
                <button
                  className="danger subtle"
                  disabled={busy}
                  onClick={() => void memberAction(m.user.id, 'remove')}
                >
                  Remover
                </button>
              )}
            </div>
          ))}
          {manage && conversation.members.length < MAX_MEMBERS && candidates.length > 0 && (
            <Field label="Adicionar amigo">
              <select
                defaultValue=""
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) void memberAction(e.target.value, 'add');
                  e.target.value = '';
                }}
              >
                <option value="">Escolher amigo…</option>
                {candidates.map((f) => (
                  <option key={f.id} value={f.user.id}>
                    {f.user.displayName}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="modal-footer">
            {role === 'owner' ? (
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  if (confirm('Excluir o grupo e todo seu histórico?'))
                    void run(
                      () => mutation(`/groups/${conversation.groupId}`, undefined, 'DELETE'),
                      true,
                    );
                }}
              >
                Excluir grupo
              </button>
            ) : (
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      mutation(`/groups/${conversation.groupId}/members`, {
                        userId: data.me.id,
                        action: 'leave',
                      }),
                    true,
                  )
                }
              >
                Sair do grupo
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
