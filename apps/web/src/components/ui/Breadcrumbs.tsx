import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb { label: string; to?: string }

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex items-center gap-1 text-xs flex-wrap" style={{ color: 'var(--fg-muted)' }}>
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} aria-hidden />}
            {c.to && i < items.length - 1
              ? <Link to={c.to} className="hover:underline" style={{ color: 'var(--fg-secondary)' }}>{c.label}</Link>
              : <span aria-current={i === items.length - 1 ? 'page' : undefined} style={{ color: 'var(--fg-primary)' }}>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
