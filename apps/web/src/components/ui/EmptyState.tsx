import type { ReactNode } from 'react';

type Art = 'jobs' | 'applications' | 'resumes' | 'chat' | 'analytics' | 'search' | 'generic';

/** Small duotone SVG illustrations that follow the theme via CSS variables. */
function Illustration({ kind }: { kind: Art }) {
  const stroke = 'var(--fg-muted)';
  const fill = 'var(--accent-dim)';
  const accent = 'var(--accent)';
  const common = { width: 120, height: 96, viewBox: '0 0 120 96', fill: 'none', 'aria-hidden': true } as const;

  switch (kind) {
    case 'jobs':
      return (
        <svg {...common}>
          <rect x="18" y="30" width="84" height="52" rx="8" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M44 30v-6a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v6" stroke={stroke} strokeWidth="2" />
          <path d="M18 54h84" stroke={stroke} strokeWidth="2" />
          <rect x="54" y="48" width="12" height="12" rx="3" fill={accent} />
        </svg>
      );
    case 'applications':
      return (
        <svg {...common}>
          <rect x="22" y="14" width="52" height="68" rx="8" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M34 34h28M34 46h28M34 58h16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path d="M70 70l30-30 8 8-30 30-12 4z" fill={accent} />
        </svg>
      );
    case 'resumes':
      return (
        <svg {...common}>
          <rect x="30" y="10" width="60" height="76" rx="8" fill={fill} stroke={stroke} strokeWidth="2" />
          <circle cx="60" cy="32" r="8" stroke={stroke} strokeWidth="2" />
          <path d="M42 58h36M42 68h24" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <circle cx="88" cy="76" r="10" fill={accent} />
          <path d="M84 76l3 3 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common}>
          <path d="M18 20h58a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8H44l-14 12V62h-12a8 8 0 0 1-8-8V28a8 8 0 0 1 8-8z" fill={fill} stroke={stroke} strokeWidth="2" />
          <circle cx="40" cy="41" r="3" fill={accent} /><circle cx="52" cy="41" r="3" fill={accent} /><circle cx="64" cy="41" r="3" fill={accent} />
          <rect x="70" y="52" width="38" height="26" rx="8" fill={accent} opacity=".85" />
        </svg>
      );
    case 'analytics':
      return (
        <svg {...common}>
          <rect x="16" y="16" width="88" height="64" rx="8" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M30 66V50M48 66V38M66 66V46M84 66V28" stroke={accent} strokeWidth="6" strokeLinecap="round" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="52" cy="42" r="24" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M70 60l22 22" stroke={accent} strokeWidth="6" strokeLinecap="round" />
          <path d="M42 42h20" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="20" y="20" width="80" height="56" rx="10" fill={fill} stroke={stroke} strokeWidth="2" />
          <circle cx="60" cy="48" r="10" fill={accent} />
        </svg>
      );
  }
}

export default function EmptyState({
  art = 'generic', title, description, action, compact,
}: { art?: Art; title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-6' : 'py-14'} px-4`}>
      <Illustration kind={art} />
      <p className="font-medium mt-3" style={{ color: 'var(--fg-primary)' }}>{title}</p>
      {description && <p className="text-sm mt-1 max-w-sm" style={{ color: 'var(--fg-muted)' }}>{description}</p>}
      {action && <div className="mt-4 flex flex-wrap gap-2 justify-center">{action}</div>}
    </div>
  );
}
