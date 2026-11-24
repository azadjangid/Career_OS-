import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAIUsage } from '@/hooks/queries';

/** Sidebar meter: share of the monthly AI token budget already used. */
export default function AIUsageMeter() {
  const { data } = useAIUsage();
  if (!data) return null;

  const pct = Math.min(100, Math.round((data.totalTokens / data.budgetTokens) * 100));
  const color = pct >= 90 ? 'var(--tone-red)' : pct >= 70 ? 'var(--tone-amber)' : 'var(--accent)';
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));

  return (
    <Link to="/analytics" className="block mx-3 mb-3 p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }} aria-label={`AI usage: ${pct}% of monthly budget used`}>
      <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--fg-secondary)' }}>
        <span className="flex items-center gap-1.5"><Sparkles size={12} style={{ color }} /> AI this month</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--fg-muted)' }}>
        {data.configured ? `${k(data.remainingTokens)} of ${k(data.budgetTokens)} tokens left` : 'Add an API key to enable AI'}
      </p>
    </Link>
  );
}
