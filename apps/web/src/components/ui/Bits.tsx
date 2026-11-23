import type { ReactNode } from 'react';
import { colorFor, initials, matchTone } from '@/lib/format';
import { STATUS_BADGE, type AppStatus } from '@/lib/constants';
import { formatStatus } from '@/lib/format';

/** Company logo (if any) or a coloured initials tile. */
export function CompanyLogo({ name, logo, size = 40 }: { name: string; logo?: string | null; size?: number }) {
  if (logo) return <img src={logo} alt="" width={size} height={size} className="rounded-lg object-cover shrink-0" style={{ width: size, height: size }} loading="lazy" />;
  return (
    <div className="rounded-lg flex items-center justify-center text-white font-bold shrink-0" style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.38 }} aria-hidden>
      {initials(name)}
    </div>
  );
}

export function StatusBadge({ status }: { status: AppStatus }) {
  return <span className={`badge ${STATUS_BADGE[status] ?? 'badge-muted'}`}>{formatStatus(status)}</span>;
}

const TONE = { green: 'badge-green', amber: 'badge-amber', red: 'badge-red' } as const;

/** Colour-coded match score: green > 80, amber 50–79, red < 50. */
export function MatchBadge({ score, title }: { score: number; title?: string }) {
  return <span className={`badge ${TONE[matchTone(score)]} font-mono`} title={title} aria-label={`Match score ${score} percent`}>{score}% match</span>;
}

export function SectionCard({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4 gap-2">
          {title && <h2 className="font-display font-semibold" style={{ color: 'var(--fg-primary)' }}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ScoreRing({ score, size = 120, label }: { score: number; size?: number; label?: string }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? '#34D399' : score >= 50 ? '#FBBF24' : '#F87171';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'Score'} ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-hover)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold" style={{ fontSize: size * 0.28, color: 'var(--fg-primary)' }}>{score}</span>
        {label && <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>{label}</span>}
      </div>
    </div>
  );
}
