import { cn } from "@/lib/utils";

/**
 * Ambika Electricals mark — a geometric bolt inside a circuit-node hexagon.
 * Legible from 16px to 48px.
 */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="url(#ae-g)" />
      <path
        d="M17.9 6.5 10.4 17.1a.6.6 0 0 0 .49.95h3.72l-1.5 7.1a.35.35 0 0 0 .62.28l7.72-10.72a.6.6 0 0 0-.49-.95h-3.86l1.44-6.96a.35.35 0 0 0-.64-.3Z"
        fill="#fff"
      />
      <circle cx="6" cy="6" r="1.6" fill="#fff" fillOpacity=".55" />
      <circle cx="26" cy="26" r="1.6" fill="#fff" fillOpacity=".55" />
      <defs>
        <linearGradient id="ae-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3182f6" />
          <stop offset="1" stopColor="#173db4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Logo({
  className,
  size = 32,
  showTagline = true,
  compact = false,
}: {
  className?: string;
  size?: number;
  showTagline?: boolean;
  compact?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight">Ambika Electricals</span>
          {showTagline && (
            <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Rewardly
            </span>
          )}
        </span>
      )}
    </span>
  );
}
