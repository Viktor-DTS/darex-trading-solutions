import React from 'react';
import Spinner from './Spinner';

function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  fullWidth = false,
  as: Component = 'button',
  className = '',
  children,
  ...rest
}) {
  const isButton = Component === 'button';
  const disabled = Boolean(rest.disabled) || loading;

  const classes = [
    'ds-btn',
    `ds-btn--${variant}`,
    size === 'sm' ? 'ds-btn--sm' : '',
    fullWidth ? 'ds-btn--full' : '',
    // Не-button елементи не мають :disabled, тож стан задаємо класом
    !isButton && disabled ? 'ds-btn--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  const extra = isButton
    ? { type: 'button', ...rest, disabled }
    : { 'aria-disabled': disabled || undefined, ...rest };

  return (
    <Component className={classes} {...extra}>
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : icon ? <span className="ds-btn__icon">{icon}</span> : null}
      {children}
    </Component>
  );
}

export default Button;
