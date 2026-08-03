"use client";

import { useId, type ReactNode } from "react";

type GameIconButtonProps = {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
};

export function GameIconButton({ icon, label, onClick, className = "" }: GameIconButtonProps) {
  return <button className={`game-icon-button ${className}`} type="button" onClick={onClick} aria-label={label}>
    <img src={icon} alt="" draggable={false} />
  </button>;
}

type GameModalProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function GameModal({ eyebrow, title, description, icon, onClose, children, footer, className = "" }: GameModalProps) {
  const titleId = useId();

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className={["game-modal", className].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
      <header className="game-modal__header">
        {icon && <span className="game-modal__icon"><img src={icon} alt="" draggable={false} /></span>}
        <div className="game-modal__heading">
          {eyebrow && <p>{eyebrow}</p>}
          <h2 id={titleId}>{title}</h2>
          {description && <span>{description}</span>}
        </div>
        <button className="game-modal__close" type="button" onClick={onClose} aria-label="关闭浮窗">×</button>
      </header>
      <div className="game-modal__body">{children}</div>
      {footer && <footer className="game-modal__footer">{footer}</footer>}
    </section>
  </div>;
}
