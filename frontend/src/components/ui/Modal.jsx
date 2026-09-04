import React, { useEffect } from 'react';

function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  footer,
  closeOnOverlay = true,
  children,
  className = '',
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && onClose) onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;

    // Повертаємо саме попереднє значення, щоб не зламати вкладені модалки
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const hasHead = Boolean(title || subtitle);

  const handleOverlayClick = (event) => {
    if (closeOnOverlay && event.target === event.currentTarget && onClose) onClose();
  };

  return (
    <div className="ds-modal-overlay" onClick={handleOverlayClick}>
      <div
        className={`ds-modal ds-modal--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
      >
        <div className={`ds-modal__head ${hasHead ? '' : 'ds-modal__head--bare'}`.trim()}>
          {hasHead && (
            <div className="ds-modal__titles">
              {title && <h2 className="ds-modal__title">{title}</h2>}
              {subtitle && <p className="ds-modal__subtitle">{subtitle}</p>}
            </div>
          )}
          <button type="button" className="ds-modal__close" onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>

        <div className="ds-modal__body">{children}</div>

        {footer && <div className="ds-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
