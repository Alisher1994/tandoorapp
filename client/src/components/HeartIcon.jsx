import React from 'react';

function HeartIcon({
  size = 20,
  filled = false,
  color = 'currentColor',
  strokeWidth = 1.9,
  style
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d="M12 21s-6.7-4.35-9.4-8.11C.43 9.84 1.33 5.6 4.7 4.08c2.2-.98 4.56-.19 5.96 1.67.59.79.68.89 1.34 1.84.66-.95.75-1.05 1.34-1.84 1.4-1.86 3.76-2.65 5.96-1.67 3.37 1.52 4.27 5.76 2.1 8.81C18.7 16.65 12 21 12 21z" />
    </svg>
  );
}

export default HeartIcon;

