import React from 'react';

function HeaderGlowBackground({ className = '' }) {
  const classes = ['themed-header-glow', className].filter(Boolean).join(' ');

  return (
    <div className={classes} aria-hidden="true">
      <span className="themed-header-glow-orb themed-header-glow-orb--one" />
      <span className="themed-header-glow-orb themed-header-glow-orb--two" />
      <span className="themed-header-glow-orb themed-header-glow-orb--three" />
      <span className="themed-header-glow-orb themed-header-glow-orb--four" />
    </div>
  );
}

export default HeaderGlowBackground;
