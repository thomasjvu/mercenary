import { Icon } from '@iconify/react';
import type { ReactNode } from 'react';

const USER_ERROR_ICONS = {
  guide: 'pixel:info-circle-solid',
  error: 'pixel:exclamation-triangle-solid',
} as const;

type UserErrorNoteProps = {
  children: ReactNode;
  icon?: string;
  variant?: keyof typeof USER_ERROR_ICONS;
};

export function UserErrorNote({ children, icon, variant = 'error' }: UserErrorNoteProps) {
  return (
    <p className={`user-error-note user-error-note--${variant}`} role="status">
      <Icon
        aria-hidden="true"
        className="user-error-note__icon icon icon--pixel"
        icon={icon ?? USER_ERROR_ICONS[variant]}
      />
      <span className="user-error-note__text">{children}</span>
    </p>
  );
}
