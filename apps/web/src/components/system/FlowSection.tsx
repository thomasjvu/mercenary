import type { ReactNode } from 'react';

type FlowSectionProps = {
  children: ReactNode;
  className?: string;
  step: string;
  title: string;
  done?: boolean;
};

export function FlowSection({ children, className = '', step, title, done }: FlowSectionProps) {
  return (
    <section
      className={`flow-section${done ? ' flow-section--done' : ''}${className ? ` ${className}` : ''}`}
    >
      <header className="flow-section__head">
        <span className="flow-section__step">{step}</span>
        <h2>{title}</h2>
      </header>
      <div className="flow-section__body">{children}</div>
    </section>
  );
}
