import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Download, Trash2, LayoutGrid, List, Plus, ChevronRight, X } from 'lucide-react';
import { useApplications, useBulkApplications, useUpdateApplicationStatus } from '@/hooks/queries';
import { useUIStore } from '@/store/ui.store';
import { STATUSES, STATUS_LABEL, type AppStatus } from '@/lib/constants';
import { downloadBlob, formatDate, formatStatus, toCSV } from '@/lib/format';
import { nextAction } from '@/lib/nextAction';
import { toast } from '@/store/toast.store';
import KanbanBoard from '@/components/applications/KanbanBoard';
import ApplicationDrawerContent from '@/components/applications/ApplicationDrawer';
import { Drawer, ConfirmDialog } from '@/components/ui/Modal';
import { CompanyLogo, MatchBadge, StatusBadge } from '@/components/ui/Bits';
import { Skeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

const FUNNEL: Array<{ label: string; statuses: AppStatus[] }> = [
  { label: 'Applied', statuses: ['APPLIED', 'SCREENING', 'INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN'] },
  { label: 'Screening', statuses: ['SCREENING', 'INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER'] },
  { label: 'Interview', statuses: ['INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER'] },
  { label: 'Offer', statuses: ['OFFER'] },
];

export default function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const { setQuickAction } = useUIStore();
  const [view, setView] = useState<'board' | 'list'>(() => (localStorage.getItem('careeros-apps-view') as 'board' | 'list') || 'board');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading, isError, refetch } = useApplications({ limit: '500' });
  const move = useUpdateApplicationStatus();
  const bulk = useBulkApplications();

  useEffect(() => { try { localStorage.setItem('careeros-apps-view', view); } catch { /* ignore */ } }, [view]);
  useEffect(() => { const o = params.get('open'); if (o) { setOpenId(o); setParams({}, { replace: true }); } }, [params, setParams]);

  const all = data?.applications ?? [];
  const apps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? all.filter(a => `${a.job.title} ${a.job.companyName}`.toLowerCase().includes(q)) : all;
  }, [all, search]);

  const funnel = FUNNEL.map(f => ({ ...f, count: all.filter(a => f.statuses.includes(a.status)).length }));

  const onSelect = (id: string, on: boolean) => setSelected(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const clearSel = () => setSelected(new Set());
  const selectedIds = [...selected].filter(id => all.some(a => a.id === id));

  const exportCsv = () => {
    const rows = (selectedIds.length ? all.filter(a => selected.has(a.id)) : apps).map(a => ({
      Company: a.job.companyName, Role: a.job.title, Status: formatStatus(a.status), Location: a.job.location ?? '',
      Applied: a.appliedAt ? formatDate(a.appliedAt, 'yyyy-MM-dd') : '', 'Follow-up': a.followUpAt ? formatDate(a.followUpAt, 'yyyy-MM-dd') : '',
      'Match score': a.job.matches?.[0] ? Math.round(a.job.matches[0].overallScore) : '', Resume: a.resume?.name ?? '', URL: a.job.applyUrl ?? '',
    }));
    if (!rows.length) { toast.info('Nothing to export'); return; }
    downloadBlob(`applications-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
    toast.success(`Exported ${rows.length} application${rows.length === 1 ? '' : 's'}`);
  };

  return (
    <div className="space-y-4">
      {/* Funnel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="Application funnel">
        {funnel.map((f, i) => (
          <div key={f.label} className="card flex items-center justify-between" style={{ padding: 12 }}>
            <div>
              <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{f.label}</p>
              <p className="font-display font-bold text-xl" style={{ color: 'var(--fg-primary)' }}>{f.count}</p>
            </div>
            {i < funnel.length - 1 && <ChevronRight size={16} className="hidden sm:block" style={{ color: 'var(--fg-muted)' }} aria-hidden />}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} aria-hidden />
          <input className="input pl-9" placeholder="Search company or role…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search applications" />
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }} role="group" aria-label="View">
            {([['board', LayoutGrid, 'Board'], ['list', List, 'List']] as const).map(([k, Icon, label]) => (
              <button key={k} onClick={() => setView(k)} aria-pressed={view === k} className="px-3 py-2 flex items-center gap-1.5 text-sm"
                style={{ background: view === k ? 'var(--accent-dim)' : 'transparent', color: view === k ? 'var(--accent)' : 'var(--fg-muted)' }}><Icon size={15} />{label}</button>
            ))}
          </div>
          <button className="btn-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>
          <button className="btn-primary" onClick={() => setQuickAction('application')}><Plus size={15} /> Add</button>
        </div>
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl px-4 py-2.5" style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }} role="region" aria-label="Bulk actions">
          <span className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{selectedIds.length} selected</span>
          <label className="sr-only" htmlFor="bulk-status">Change status of selected</label>
          <select id="bulk-status" className="input w-auto text-sm py-1.5" defaultValue="" onChange={e => { if (e.target.value) { bulk.mutate({ ids: selectedIds, status: e.target.value as AppStatus }); clearSel(); e.target.value = ''; } }}>
            <option value="" disabled>Change status…</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <button className="btn-secondary text-sm py-1.5" onClick={exportCsv}><Download size={14} /> Export</button>
          <button className="text-sm py-1.5 px-3 rounded-lg font-medium flex items-center gap-1.5" style={{ color: '#F87171', border: '1px solid #F8717155' }} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete</button>
          <button className="btn-ghost p-1.5 ml-auto" onClick={clearSel} aria-label="Clear selection"><X size={16} /></button>
        </div>
      )}

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="w-72 h-72 rounded-xl shrink-0" />)}</div>
      ) : isError ? (
        <EmptyState art="search" title="Couldn’t load applications" action={<button className="btn-primary" onClick={() => refetch()}>Try again</button>} />
      ) : all.length === 0 ? (
        <EmptyState art="applications" title="Track your first application" description="Add one manually, or apply from the Jobs page and it will appear here automatically."
          action={<><button className="btn-primary" onClick={() => setQuickAction('application')}>Add application</button></>} />
      ) : apps.length === 0 ? (
        <EmptyState art="search" title="No matches" description={`Nothing found for “${search}”.`} />
      ) : view === 'board' ? (
        <KanbanBoard apps={apps} selected={selected} onSelect={onSelect} onOpen={setOpenId} onMove={(id, status) => move.mutate({ id, status })} />
      ) : (
        <div className="card overflow-x-auto" style={{ padding: 0 }}>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="w-10 px-4 py-3"><input type="checkbox" className="accent-[var(--accent)]" aria-label="Select all"
                  checked={apps.length > 0 && apps.every(a => selected.has(a.id))} onChange={e => setSelected(e.target.checked ? new Set(apps.map(a => a.id)) : new Set())} /></th>
                {['Position', 'Status', 'Applied', 'Match', 'Next action'].map(h => <th key={h} className="text-left px-3 py-3 text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {apps.map(a => {
                const act = nextAction(a);
                return (
                  <tr key={a.id} className="hover:bg-[var(--bg-hover)]" style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3"><input type="checkbox" className="accent-[var(--accent)]" checked={selected.has(a.id)} onChange={e => onSelect(a.id, e.target.checked)} aria-label={`Select ${a.job.title}`} /></td>
                    <td className="px-3 py-3"><button className="flex items-center gap-3 text-left" onClick={() => setOpenId(a.id)}><CompanyLogo name={a.job.companyName} logo={a.job.company?.logo} size={32} /><span><span className="block font-medium" style={{ color: 'var(--fg-primary)' }}>{a.job.title}</span><span className="text-xs" style={{ color: 'var(--fg-secondary)' }}>{a.job.companyName}</span></span></button></td>
                    <td className="px-3 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-3 py-3 text-xs" style={{ color: 'var(--fg-muted)' }}>{formatDate(a.appliedAt ?? a.createdAt, 'd MMM')}</td>
                    <td className="px-3 py-3">{a.job.matches?.[0] ? <MatchBadge score={Math.round(a.job.matches[0].overallScore)} /> : <span style={{ color: 'var(--fg-muted)' }}>—</span>}</td>
                    <td className="px-3 py-3 text-xs" style={{ color: 'var(--fg-secondary)' }}>{act?.label ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={!!openId} onClose={() => setOpenId(null)} title="Application details">
        {openId && <ApplicationDrawerContent id={openId} onClose={() => setOpenId(null)} />}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete} onClose={() => setConfirmDelete(false)} danger busy={bulk.isPending}
        title={`Delete ${selectedIds.length} application${selectedIds.length === 1 ? '' : 's'}?`}
        message="This permanently removes the applications and their notes and timeline. The jobs themselves are kept."
        confirmLabel="Delete"
        onConfirm={() => { bulk.mutate({ ids: selectedIds }, { onSuccess: () => toast.success('Applications deleted') }); clearSel(); setConfirmDelete(false); }}
      />
    </div>
  );
}
