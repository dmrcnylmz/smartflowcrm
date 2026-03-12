'use client';

import { cn } from '@/lib/utils';

interface LogoProps {
  collapsed?: boolean;
  className?: string;
}

/**
 * Callception Logo — Professional SVG headset icon + wordmark
 * Theme-aware: uses currentColor to match the active theme's primary color.
 * Displays full wordmark when expanded, icon-only when collapsed.
 */
export function Logo({ collapsed = false, className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {/* Icon Mark — Headset with signal waves */}
      <div className="shrink-0">
        <svg
          width={collapsed ? 28 : 26}
          height={collapsed ? 28 : 26}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-primary"
          aria-hidden="true"
        >
          {/* Headset band */}
          <path
            d="M6 18V16C6 10.477 10.477 6 16 6C21.523 6 26 10.477 26 16V18"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Left earpiece */}
          <rect
            x="4"
            y="17"
            width="5"
            height="8"
            rx="2"
            fill="currentColor"
            opacity="0.9"
          />
          {/* Right earpiece */}
          <rect
            x="23"
            y="17"
            width="5"
            height="8"
            rx="2"
            fill="currentColor"
            opacity="0.9"
          />
          {/* Microphone arm */}
          <path
            d="M9 25V27C9 28.105 9.895 29 11 29H15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Mic dot */}
          <circle
            cx="16.5"
            cy="29"
            r="1.5"
            fill="currentColor"
            opacity="0.7"
          />
          {/* Signal wave 1 */}
          <path
            d="M28 12C29.5 13.5 30 15 30 16.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.4"
          />
          {/* Signal wave 2 */}
          <path
            d="M27 9.5C29.5 12 31 14.5 31 17"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.25"
          />
        </svg>
      </div>

      {/* Wordmark — only shown when expanded */}
      {!collapsed && (
        <div className="animate-fade-in min-w-0">
          <h1 className="text-[15px] font-display tracking-tight text-gradient leading-tight">
            CALLCEPTION
          </h1>
          <p className="text-[10px] text-muted-foreground mt-0 tracking-wide uppercase">
            AI Call Center
          </p>
        </div>
      )}
    </div>
  );
}
