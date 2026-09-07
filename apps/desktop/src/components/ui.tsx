import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { User } from '@orbit/shared';
export function Avatar({
  user,
  size = 'normal',
}: {
  user: Pick<User, 'displayName' | 'avatar' | 'status'>;
  size?: 'small' | 'normal' | 'large';
}) {
  return (
    <span className={`avatar ${size}`}>
      <span>{user.displayName.slice(0, 2).toUpperCase()}</span>
      {user.avatar && (
        <img
          src={user.avatar}
          alt=""
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
      <i className={`status ${user.status}`} />
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'wide' : ''}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon" aria-label="Fechar" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  icon,
  heading,
  children,
}: {
  icon: ReactNode;
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h2>{heading}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export const statusLabel = {
  online: 'Disponível',
  away: 'Ausente',
  busy: 'Ocupado',
  offline: 'Offline',
};
