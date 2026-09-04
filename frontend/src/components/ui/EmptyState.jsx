import React from 'react';

function EmptyState({ icon, title, description, action, className = '', ...rest }) {
  return (
    <div className={`ds-empty ${className}`.trim()} {...rest}>
      {icon && <div className="ds-empty__icon" aria-hidden="true">{icon}</div>}
      {title && <h3 className="ds-empty__title">{title}</h3>}
      {description && <p className="ds-empty__description">{description}</p>}
      {action && <div className="ds-empty__action">{action}</div>}
    </div>
  );
}

export default EmptyState;
