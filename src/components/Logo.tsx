'use client';

import React from 'react';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer circle background */}
      <circle cx="60" cy="60" r="58" fill="#EFF6FF" stroke="#2563EB" strokeWidth="3" />

      {/* House/Garage shape */}
      <g>
        {/* Roof */}
        <path d="M 30 65 L 60 35 L 90 65" fill="#2563EB" stroke="#1E40AF" strokeWidth="2" />

        {/* Main building */}
        <rect x="32" y="65" width="56" height="45" fill="#3B82F6" stroke="#1E40AF" strokeWidth="2" />

        {/* Door */}
        <rect x="50" y="80" width="20" height="30" fill="#1E40AF" stroke="#1E40AF" strokeWidth="1" />
        <circle cx="68" cy="95" r="2" fill="#FCD34D" />

        {/* Window left */}
        <rect x="38" y="72" width="12" height="12" fill="#BFDBFE" stroke="#1E40AF" strokeWidth="1" />
        <line x1="44" y1="72" x2="44" y2="84" stroke="#1E40AF" strokeWidth="1" />
        <line x1="38" y1="78" x2="50" y2="78" stroke="#1E40AF" strokeWidth="1" />

        {/* Window right */}
        <rect x="70" y="72" width="12" height="12" fill="#BFDBFE" stroke="#1E40AF" strokeWidth="1" />
        <line x1="76" y1="72" x2="76" y2="84" stroke="#1E40AF" strokeWidth="1" />
        <line x1="70" y1="78" x2="82" y2="78" stroke="#1E40AF" strokeWidth="1" />

        {/* Flag pole with price tag */}
        <line x1="92" y1="50" x2="92" y2="65" stroke="#6B7280" strokeWidth="2" />
        <path
          d="M 92 50 L 102 47 L 102 53 Z"
          fill="#EF4444"
          stroke="#DC2626"
          strokeWidth="1"
        />

        {/* Dollar sign on flag */}
        <text
          x="101"
          y="52"
          fontSize="8"
          fontWeight="bold"
          fill="white"
          textAnchor="middle"
        >
          $
        </text>
      </g>

      {/* Decorative elements */}
      <circle cx="25" cy="25" r="4" fill="#2563EB" opacity="0.6" />
      <circle cx="95" cy="30" r="3" fill="#2563EB" opacity="0.4" />
      <circle cx="20" cy="95" r="3" fill="#2563EB" opacity="0.3" />
    </svg>
  );
}
