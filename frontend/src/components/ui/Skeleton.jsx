import React from 'react';

function Skeleton({ width, height = 10, circle = false, radius, className = '', style, ...rest }) {
  const size = circle && width == null ? height : width;

  const inlineStyle = {
    width: size,
    height,
    ...(radius != null ? { borderRadius: radius } : null),
    ...style,
  };

  return (
    <span
      className={`ds-skeleton ${circle ? 'ds-skeleton--circle' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      style={inlineStyle}
      aria-hidden="true"
      {...rest}
    />
  );
}

export default Skeleton;
