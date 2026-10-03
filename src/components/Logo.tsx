'use client';

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 32, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="YardSale Hub Logo"
    >
      <defs>
        <linearGradient id="pinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <linearGradient id="frameGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
        <filter id="shadow3d" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Outer Pin Shape with Depth Gradient */}
      <path
        d="M256 32 C150 32 80 102 80 208 C80 320 256 480 256 480 C256 480 432 320 432 208 C432 102 362 32 256 32 Z"
        fill="url(#pinGrad)"
        filter="url(#shadow3d)"
      />

      {/* Folded Yard Sign Frame Overlay (Amber Gold) */}
      <path
        d="M128 140 C128 120 144 104 164 104 L348 104 C368 104 384 120 384 140 L384 260 C384 280 368 296 348 296 L164 296 C144 296 128 280 128 260 Z"
        fill="none"
        stroke="url(#frameGrad)"
        strokeWidth="22"
        strokeLinejoin="round"
      />

      {/* Inner White Board Background */}
      <rect x="152" y="128" width="208" height="144" rx="18" fill="#FFFFFF" />

      {/* Geometric "Y" Monogram (Emerald Green) */}
      <path
        d="M188 160 L236 212 L236 248 L276 248 L276 212 L324 160 L284 160 L256 192 L228 160 Z"
        fill="#059669"
      />

      {/* Pin Pointer Hole Cutout */}
      <circle cx="256" cy="380" r="28" fill="#FFFFFF" />
    </svg>
  );
}
