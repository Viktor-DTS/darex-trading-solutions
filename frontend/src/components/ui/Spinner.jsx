import React from 'react';

function Spinner({ size = 14, className = '', ...rest }) {
  const style = {
    width: size,
    height: size,
    borderWidth: Math.max(1, Math.round(size / 8)),
  };

  return <span className={`ds-spinner ${className}`.trim()} style={style} aria-hidden="true" {...rest} />;
}

export default Spinner;
