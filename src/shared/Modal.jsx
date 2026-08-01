import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ isOpen, onClose, title, children, wide }) {
  const boxRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    boxRef.current?.focus();
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay"
      id="modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={boxRef}
        className={`modal-box${wide ? ' modal-wide' : ''}`}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>,
    document.body
  );
}
