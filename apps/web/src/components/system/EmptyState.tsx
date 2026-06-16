import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <div className={className ? `empty-state ${className}` : 'empty-state'}>
      <p className="eyebrow">{title}</p>
      <p>{body}</p>
      {action}
    </div>
  );
}
