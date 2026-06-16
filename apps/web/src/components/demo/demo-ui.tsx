import type { ReactNode } from 'react';

export type SpecialistTone = 'ready' | 'available' | 'offline' | 'working';

export function ChatMessage({
  children,
  role,
  tone = 'default',
}: {
  children: ReactNode;
  role: 'assistant' | 'user';
  tone?: 'default' | 'error' | 'success';
}) {
  return (
    <article
      className={`mercenary-message mercenary-message--${role} ${
        tone === 'error'
          ? 'mercenary-message--error'
          : tone === 'success'
            ? 'mercenary-message--success'
            : ''
      }`}
    >
      <div className="mercenary-message__body">
        <div className="mercenary-message__bubble">{children}</div>
      </div>
    </article>
  );
}

export function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mercenary-sidebar__signal">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function StatusPill({ children, tone }: { children: string; tone: SpecialistTone }) {
  return <span className={`mercenary-status mercenary-status--${tone}`}>{children}</span>;
}

export function SpecialistProgressMeter({
  progressValue,
  tone,
}: {
  progressValue: number;
  tone: SpecialistTone;
}) {
  const filledBars = Math.max(1, Math.min(10, Math.round(progressValue * 10)));

  return (
    <div
      aria-hidden="true"
      className={`mercenary-sidebar__meter mercenary-sidebar__meter--${tone}`}
      title={`${Math.round(progressValue * 100)}%`}
    >
      {Array.from({ length: 10 }).map((_, index) => (
        <span
          className={`mercenary-sidebar__meter-bar ${index < filledBars ? 'mercenary-sidebar__meter-bar--filled' : ''}`}
          key={index}
        />
      ))}
    </div>
  );
}

export function TypingDots() {
  return (
    <div className="mercenary-typing" aria-label="Mercenary is typing">
      <span />
      <span />
      <span />
    </div>
  );
}
