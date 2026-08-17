import type {JSX} from 'react';

/**
 * Inline rather than pulled from public/icons.svg: those symbols hard-code
 * their fills, and everything here has to take the color of whatever it sits
 * in -- a dark header bar, a hover state, an error card.
 */
interface IconProps {
  size?: number;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function ChevronLeft({size = 16}: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10 3.5 5.5 8l4.5 4.5" {...stroke} />
    </svg>
  );
}

export function ChevronRight({size = 16}: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 3.5 10.5 8 6 12.5" {...stroke} />
    </svg>
  );
}

export function Dice({size = 15}: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.5" {...stroke} />
      <circle cx="5.6" cy="5.6" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="10.4" cy="10.4" r="1" fill="currentColor" />
    </svg>
  );
}

export function Search({size = 14}: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" {...stroke} />
      <path d="m10.2 10.2 3 3" {...stroke} />
    </svg>
  );
}

export function Copy({size = 15}: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.75" y="5.75" width="8.5" height="8.5" rx="2" {...stroke} />
      <path d="M11 3.6A1.85 1.85 0 0 0 9.2 1.75H3.6A1.85 1.85 0 0 0 1.75 3.6v5.6c0 .95.7 1.74 1.6 1.84" {...stroke} />
    </svg>
  );
}

export function Check({size = 15}: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" {...stroke} />
    </svg>
  );
}

export function Warning({size = 16}: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" {...stroke} />
      <path d="M8 4.9v3.6" {...stroke} />
      <circle cx="8" cy="11.1" r=".85" fill="currentColor" />
    </svg>
  );
}

export function Github({size = 16}: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 19 19" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M9.356 1.85C5.05 1.85 1.57 5.356 1.57 9.694a7.84 7.84 0 0 0 5.324 7.44c.387.079.528-.168.528-.376 0-.182-.013-.805-.013-1.454-2.165.467-2.616-.935-2.616-.935-.349-.91-.864-1.143-.864-1.143-.71-.48.051-.48.051-.48.787.051 1.2.805 1.2.805.695 1.194 1.817.857 2.268.649.064-.507.27-.857.49-1.052-1.728-.182-3.545-.857-3.545-3.87 0-.857.31-1.558.8-2.104-.078-.195-.349-1 .077-2.078 0 0 .657-.208 2.14.805a7.5 7.5 0 0 1 1.946-.26c.657 0 1.328.092 1.946.26 1.483-1.013 2.14-.805 2.14-.805.426 1.078.155 1.883.078 2.078.502.546.799 1.247.799 2.104 0 3.013-1.818 3.675-3.558 3.87.284.247.528.714.528 1.454 0 1.052-.012 1.896-.012 2.156 0 .208.142.455.528.377a7.84 7.84 0 0 0 5.324-7.441c.013-4.338-3.48-7.844-7.773-7.844"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function Paper({size = 16}: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.25 2.75A1.5 1.5 0 0 1 4.75 1.25H9.5l3.25 3.25v8.75a1.5 1.5 0 0 1-1.5 1.5h-6.5a1.5 1.5 0 0 1-1.5-1.5z" {...stroke} />
      <path d="M9.25 1.5v3.25h3.25M6 8.5h4M6 11h2.75" {...stroke} />
    </svg>
  );
}
