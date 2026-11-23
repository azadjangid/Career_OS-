import type { CSSProperties } from 'react';

/** Shimmer placeholder block. Size it with className/style; decorative so hidden from screen readers. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card space-y-3" role="status" aria-label="Loading">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/3 rounded" />
          <Skeleton className="h-3 w-1/3 rounded" />
        </div>
      </div>
      {Array.from({ length: lines - 1 }, (_, i) => (
        <Skeleton key={i} className="h-3 rounded" style={{ width: `${90 - i * 18}%` }} />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <CardSkeleton key={i} lines={2} />)}
    </div>
  );
}
