import React from 'react';

function Card({ title, subtitle, actions, padding = 'md', className = '', children, ...rest }) {
  const hasHead = Boolean(title || subtitle || actions);

  return (
    <div className={`ds-card ${className}`.trim()} {...rest}>
      {hasHead && (
        <div className="ds-card__head">
          {(title || subtitle) && (
            <div className="ds-card__titles">
              {title && <h3 className="ds-card__title">{title}</h3>}
              {subtitle && <p className="ds-card__subtitle">{subtitle}</p>}
            </div>
          )}
          {actions && <div className="ds-card__actions">{actions}</div>}
        </div>
      )}
      <div className={`ds-card__body ds-card__body--${padding}`}>{children}</div>
    </div>
  );
}

export default Card;
