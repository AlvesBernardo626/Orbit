import { Orbit, Headphones, Compass, ArrowUpRight } from 'lucide-react';
import type { Bootstrap, Conversation, User } from '@orbit/shared';
import { Avatar } from './ui';
export function DetailsPanel({
  selected,
  data,
  setProfile,
}: {
  selected?: Conversation;
  data: Bootstrap;
  setProfile: (user: User) => void;
}) {
  return (
    <aside className="details-panel">
      {selected ? (
        <>
          <div className="details-heading">
            NESTA CONVERSA<span>{selected.members.length}</span>
          </div>
          {selected.members.map((m) => (
            <button className="participant-row" key={m.user.id} onClick={() => setProfile(m.user)}>
              <Avatar user={m.user} size="small" />
              <span>
                <strong>{m.user.displayName}</strong>
                <small>
                  {m.role === 'owner'
                    ? 'Proprietário'
                    : m.role === 'admin'
                      ? 'Administrador'
                      : m.user.customStatus || 'Membro'}
                </small>
              </span>
            </button>
          ))}
          <div className="details-note">
            <Headphones size={22} />
            <h3>Melhor com companhia.</h3>
            <p>Entre na chamada para conversar por voz ou compartilhar sua tela.</p>
          </div>
        </>
      ) : (
        <>
          <div className="details-heading">
            POR PERTO<span>AGORA</span>
          </div>
          <div className="quiet-illustration">
            <Compass size={44} />
          </div>
          <h3>Sinta-se em casa.</h3>
          <p className="muted">Seus amigos online aparecem aqui. Uma conversa está a um clique.</p>
          {data.friends
            .filter((f) => f.state === 'accepted' && f.user.status !== 'offline')
            .slice(0, 10)
            .map((f) => (
              <button className="participant-row" key={f.id} onClick={() => setProfile(f.user)}>
                <Avatar user={f.user} size="small" />
                <span>
                  <strong>{f.user.displayName}</strong>
                  <small>{f.user.customStatus || 'Disponível'}</small>
                </span>
              </button>
            ))}
          <div className="details-note">
            <span className="eyebrow">SEU PEQUENO UNIVERSO</span>
            <h3>Compartilhe o momento.</h3>
            <p>Um jogo, um projeto ou aquele vídeo. Abra a tela para seus amigos.</p>
            <ArrowUpRight size={22} />
          </div>
        </>
      )}
      <div className="details-footer">
        <Orbit size={14} />
        Perto de quem importa.
      </div>
    </aside>
  );
}
