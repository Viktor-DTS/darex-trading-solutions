import React from 'react';

function Badge({ tone = 'neutral', soft = true, icon, className = '', children, ...rest }) {
  const classes = [
    'ds-badge',
    `ds-badge--${tone}`,
    soft ? 'ds-badge--soft' : 'ds-badge--solid',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} {...rest}>
      {icon ? <span className="ds-badge__icon">{icon}</span> : null}
      {children}
    </span>
  );
}

export default Badge;
