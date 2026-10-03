import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <svg width="32" height="32" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M256 32 C150 32 80 102 80 208 C80 320 256 480 256 480 C256 480 432 320 432 208 C432 102 362 32 256 32 Z"
          fill="#059669"
        />
        <path
          d="M128 140 C128 120 144 104 164 104 L348 104 C368 104 384 120 384 140 L384 260 C384 280 368 296 348 296 L164 296 C144 296 128 280 128 260 Z"
          fill="none"
          stroke="#F59E0B"
          strokeWidth="26"
          strokeLinejoin="round"
        />
        <rect x="152" y="128" width="208" height="144" rx="18" fill="#FFFFFF" />
        <path d="M188 160 L236 212 L236 248 L276 248 L276 212 L324 160 L284 160 L256 192 L228 160 Z" fill="#059669" />
        <circle cx="256" cy="380" r="28" fill="#FFFFFF" />
      </svg>
    ),
    { ...size }
  );
}
