import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Bell } from 'lucide-react';
import type { Application } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { nextAction, ACTION_BADGE } from '@/lib/nextAction';
import { CompanyLogo, MatchBadge } from '@/components/ui/Bits';

interface Props {
  app: Application;
  selected: boolean;
  onSelect: (id: string, on: boolean) => void;
  onOpen: (id: string) => void;
  overlay?: boolean;
}

export function CardBody({ app, selected, onSelect, onOpen }: Omit<Props, 'overlay'>) {
  const match = app.job.matches?.[0]?.overallScore;
  const action = nextAction(app);
  return (
    <div className="p-3 rounded-xl select-none" style={{ background: 'var(--bg-card)', border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}` }}>
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox" checked={selected} onChange={e => onSelect(app.id, e.target.checked)}
          onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
          className="mt-1 w-4 h-4 accent-[var(--accent)] shrink-0" aria-label={`Select ${app.job.title} at ${app.job.companyName}`}
        />
        <CompanyLogo name={app.job.companyName} logo={app.job.company?.logo} size={34} />
        <button
          type="button" onClick={() => onOpen(app.id)} onPointerDown={e => e.stopPropagation()}
          className="flex-1 min-w-0 text-left" aria-label={`Open details for ${app.job.title} at ${app.job.companyName}`}
        >
          <p className="text-sm font-medium leading-snug truncate" style={{ color: 'var(--fg-primary)' }}>{app.job.title}</p>
          <p className="text-xs truncate" style={{ color: 'var(--fg-secondary)' }}>{app.job.companyName}</p>
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
        <span className="flex items-center gap-1"><Calendar size={12} aria-hidden />{formatDate(app.appliedAt ?? app.createdAt, 'd MMM')}</span>
        {match != null && <MatchBadge score={Math.round(match)} />}
      </div>
      {action && (
        <div className="mt-2"><span className={`badge ${ACTION_BADGE[action.tone]}`}><Bell size={10} aria-hidden />{action.label}</span></div>
      )}
    </div>
  );
}

export default function ApplicationCard(props: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: props.app.id, data: { status: props.app.status } });
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : 1, touchAction: 'manipulation', cursor: 'grab' }}
    >
      <CardBody {...props} />
    </div>
  );
}
