import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LabelList,
} from 'recharts';
import { Download, BarChart3, TrendingUp, Percent, Zap, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatStatus, formatDate, apiError } from '@/lib/format';
import { STATUS_COLOR, type AppStatus } from '@/lib/constants';
import { downloadPdf } from '@/lib/exportDocs';
import { toast } from '@/store/toast.store';
import { SectionCard } from '@/components/ui/Bits';
import { CardSkeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

interface Overview {
  range: string; from: string | null; to: string | null; total: number; responseRate: number;
  discoveredCount: number;
  discovery: Array<{ week: string; discovered: number; applied: number }>;
  matchTrend: Array<{ week: string; avgMatch: number | null; matches: number }>;
  monthly: Array<{ month: string; applications: number; interviews: number; offers: number }>;
  rates: { discoveredToApplied: number; responseRate: number; interviewRate: number; interviewSuccess: number; offerRate: number };
  byStatus: Array<{ status: AppStatus; count: number }>;
  weeks: Array<{ week: string; applications: number; responses: number; responseRate: number }>;
  funnel: Array<{ stage: string; count: number; conversion: number }>;
  topCompanies: Array<{ company: string; count: number }>;
  skillsGap: Array<{ skill: string; demand: number; you: number }>;
  ai: { perDay: Array<{ day: string; requests: number; tokens: number }>; byFeature: Array<{ feature: string; tokens: number }>; requests: number; tokens: number; budgetTokens: number };
}

const RANGES = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time']] as const;
const AXIS = { fill: '#878BB0', fontSize: 11 };
const GRID = 'rgba(136,153,187,.18)';
const TIP = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--fg-primary)' };
const FEATURE_LABEL: Record<string, string> = { jd_analysis: 'Job analysis', skill_gap: 'Skill gap', career_roadmap: 'Career roadmap', application_help: 'Application help', interview_practice: 'Interview practice', agent: 'AI agent chat', resume_analysis: 'Resume analysis', job_match: 'Job match', cover_letter: 'Cover letters', interview_prep: 'Interview prep', resume_parse: 'Resume parsing', resume_tailor: 'Resume tailoring', resume_improve: 'Resume improvement' };

export default function AnalyticsPage() {
  const [range, setRange] = useState<(typeof RANGES)[number][0] | 'custom'>('30');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const custom = range === 'custom';
  const params = custom ? { from: from || undefined, to: to || undefined } : { range };
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['analytics', params],
    enabled: !custom || !!(from || to),
    queryFn: async () => (await api.get('/analytics/overview', { params })).data.data as Overview,
  });

  const exportReport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const label = custom ? `${data.from ?? 'start'} to ${data.to ?? 'today'}` : RANGES.find(r => r[0] === range)![1];
      await downloadPdf('CareerOS analytics report', [
        { heading: `Period: ${label} · generated ${formatDate(new Date())}`, lines: [] },
        { heading: 'Summary', lines: [`Applications: ${data.total}`, `Response rate: ${data.responseRate}%`, ...data.funnel.map(f => `${f.stage}: ${f.count}${f.stage === 'Applications' ? '' : ` (${f.conversion}% of previous stage)`}`)] },
        { heading: 'Conversion', lines: [`Jobs discovered: ${data.discoveredCount}`, `Discovered → applied: ${data.rates.discoveredToApplied}%`, `Applied → interview: ${data.rates.interviewRate}%`, `Interview → offer (interview success): ${data.rates.interviewSuccess}%`, `Applied → offer: ${data.rates.offerRate}%`] },
        { heading: 'Monthly progress', lines: data.monthly.length ? data.monthly.map(m => `${m.month}: ${m.applications} applied, ${m.interviews} interviews, ${m.offers} offers`) : ['—'] },
        { heading: 'Status breakdown', lines: data.byStatus.length ? data.byStatus.map(s => `${formatStatus(s.status)}: ${s.count}`) : ['No applications in this period'] },
        { heading: 'Top companies', lines: data.topCompanies.length ? data.topCompanies.map(c => `${c.company}: ${c.count}`) : ['—'] },
        { heading: 'Skills gap (most demanded skills in your saved and applied jobs)', lines: data.skillsGap.length ? data.skillsGap.map(s => `${s.skill}: ${s.you ? 'you have it' : 'missing'} (demand ${s.demand}/100)`) : ['—'] },
        { heading: 'Weekly applications', lines: data.weeks.map(w => `${w.week}: ${w.applications} applied, ${w.responses} responses (${w.responseRate}%)`) },
        { heading: 'AI usage (last 30 days)', lines: [`Requests: ${data.ai.requests}`, `Tokens: ${data.ai.tokens.toLocaleString()}`, ...data.ai.byFeature.map(f => `${FEATURE_LABEL[f.feature] ?? f.feature}: ${f.tokens.toLocaleString()} tokens`)] },
      ], `careeros-report-${custom ? `${data.from ?? 'start'}-${data.to ?? 'today'}` : range}`);
      toast.success('Report downloaded');
    } catch (e) { toast.error(apiError(e, 'Could not create the report')); } finally { setExporting(false); }
  };

  const hasApps = (data?.total ?? 0) > 0;
  const interviews = data?.funnel.find(f => f.stage === 'Interviews')?.count ?? 0;
  const offers = data?.funnel.find(f => f.stage === 'Offers')?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-lg w-fit overflow-x-auto" style={{ background: 'var(--bg-secondary)' }} role="tablist" aria-label="Time range">
          {RANGES.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={range === k} onClick={() => setRange(k)} className="px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap"
              style={{ background: range === k ? 'var(--bg-card)' : 'transparent', color: range === k ? 'var(--accent)' : 'var(--fg-secondary)' }}>{label}</button>
          ))}
          <button role="tab" aria-selected={custom} onClick={() => setRange('custom')} className="px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap"
            style={{ background: custom ? 'var(--bg-card)' : 'transparent', color: custom ? 'var(--accent)' : 'var(--fg-secondary)' }}>Custom</button>
        </div>
        {custom && (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="an-from" style={{ color: 'var(--fg-muted)' }}>From</label>
            <input id="an-from" type="date" className="input py-1.5 w-auto" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
            <label htmlFor="an-to" style={{ color: 'var(--fg-muted)' }}>to</label>
            <input id="an-to" type="date" className="input py-1.5 w-auto" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
          </div>
        )}
        <button className="btn-secondary w-fit" onClick={exportReport} disabled={!data || exporting}>
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download report
        </button>
      </div>

      {custom && !from && !to ? <SectionCard><EmptyState art="analytics" compact title="Pick a date range" description="Choose a start date, an end date, or both." /></SectionCard>
        : isLoading ? <div className="grid md:grid-cols-2 gap-4">{Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} lines={5} />)}</div>
        : isError ? <EmptyState art="analytics" title="Couldn’t load analytics" description={apiError(error)} action={<button className="btn-primary" onClick={() => refetch()}>Try again</button>} />
        : !data ? null : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat icon={BarChart3} label="Applications" value={data.total} color="#60A5FA" />
              <Stat icon={Percent} label="Response rate" value={`${data.responseRate}%`} color="var(--accent)" />
              <Stat icon={TrendingUp} label="Interviews / offers" value={`${interviews} / ${offers}`} color="#34D399" />
              <Stat icon={Zap} label="AI requests (30d)" value={data.ai.requests} color="#A78BFA" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat icon={BarChart3} label="Jobs discovered" value={data.discoveredCount} color="#F472B6" />
              <Stat icon={Percent} label="Discovered → applied" value={`${data.rates.discoveredToApplied}%`} color="#60A5FA" />
              <Stat icon={Percent} label="Applied → interview" value={`${data.rates.interviewRate}%`} color="#FBBF24" />
              <Stat icon={Percent} label="Interview success (offers)" value={`${data.rates.interviewSuccess}%`} color="#34D399" />
            </div>

            {!hasApps && (
              <SectionCard><EmptyState art="analytics" compact title="No applications in this period" description="Add applications, or load demo data from Settings to explore the charts." /></SectionCard>
            )}

            <div className="grid lg:grid-cols-2 gap-4">
              <SectionCard title="Application breakdown">
                {hasApps ? (
                  <div className="h-64">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie isAnimationActive={false} data={data.byStatus.map(s => ({ ...s, name: formatStatus(s.status) }))} dataKey="count" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
                          {data.byStatus.map(s => <Cell key={s.status} fill={STATUS_COLOR[s.status]} />)}
                        </Pie>
                        <Tooltip contentStyle={TIP} /><Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-sm text-center py-16" style={{ color: 'var(--fg-muted)' }}>No data yet</p>}
              </SectionCard>

              <SectionCard title="Conversion funnel">
                {hasApps ? (
                  <div className="space-y-3 pt-1">
                    {data.funnel.map((f, i) => {
                      const max = Math.max(data.funnel[0]!.count, 1);
                      return (
                        <div key={f.stage}>
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: 'var(--fg-secondary)' }}>{f.stage}</span>
                            <span className="font-mono" style={{ color: 'var(--fg-primary)' }}>{f.count}{i > 0 && <span style={{ color: 'var(--fg-muted)' }}> · {f.conversion}%</span>}</span>
                          </div>
                          <div className="h-7 rounded-md overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                            <div className="h-full rounded-md" style={{ width: `${Math.max((f.count / max) * 100, f.count ? 3 : 0)}%`, background: ['var(--tone-blue)', 'var(--tone-amber)', '#D8B46A', 'var(--tone-green)'][i], transition: 'width .6s' }} />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>Percentages show conversion from the previous stage.</p>
                  </div>
                ) : <p className="text-sm text-center py-16" style={{ color: 'var(--fg-muted)' }}>No data yet</p>}
              </SectionCard>

              <SectionCard title="Applications per week">
                <div className="h-60">
                  <ResponsiveContainer>
                    <LineChart data={data.weeks} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="week" tick={AXIS} tickFormatter={w => w.slice(5)} /><YAxis allowDecimals={false} tick={AXIS} />
                      <Tooltip contentStyle={TIP} labelFormatter={w => `Week of ${w}`} />
                      <Line isAnimationActive={false} type="monotone" dataKey="applications" name="Applications" stroke="#D8B46A" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <SectionCard title="Response rate trend">
                <div className="h-60">
                  <ResponsiveContainer>
                    <LineChart data={data.weeks} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="week" tick={AXIS} tickFormatter={w => w.slice(5)} /><YAxis domain={[0, 100]} unit="%" tick={AXIS} />
                      <Tooltip contentStyle={TIP} labelFormatter={w => `Week of ${w}`} formatter={v => [`${v}%`, 'Response rate']} />
                      <Line isAnimationActive={false} type="monotone" dataKey="responseRate" name="Response rate" stroke="#34D399" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <SectionCard title="Top companies applied to">
                {data.topCompanies.length ? (
                  <div className="h-60">
                    <ResponsiveContainer>
                      <BarChart data={data.topCompanies} layout="vertical" margin={{ left: 10, right: 24 }}>
                        <XAxis type="number" allowDecimals={false} tick={AXIS} hide /><YAxis type="category" dataKey="company" width={90} tick={AXIS} />
                        <Tooltip contentStyle={TIP} cursor={{ fill: 'rgba(136,153,187,.1)' }} />
                        <Bar isAnimationActive={false} dataKey="count" name="Applications" fill="#60A5FA" radius={[0, 6, 6, 0]}><LabelList dataKey="count" position="right" style={{ fill: '#878BB0', fontSize: 11 }} /></Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-sm text-center py-16" style={{ color: 'var(--fg-muted)' }}>No data yet</p>}
              </SectionCard>

              <SectionCard title="Skills gap">
                {data.skillsGap.length >= 3 ? (
                  <div className="h-64">
                    <ResponsiveContainer>
                      <RadarChart data={data.skillsGap} outerRadius="72%">
                        <PolarGrid stroke={GRID} /><PolarAngleAxis dataKey="skill" tick={AXIS} /><PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar isAnimationActive={false} name="Demand in your jobs" dataKey="demand" stroke="#D8B46A" fill="#D8B46A" fillOpacity={0.25} />
                        <Radar isAnimationActive={false} name="Your skills" dataKey="you" stroke="#34D399" fill="#34D399" fillOpacity={0.3} />
                        <Legend wrapperStyle={{ fontSize: 12 }} /><Tooltip contentStyle={TIP} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-sm text-center py-16" style={{ color: 'var(--fg-muted)' }}>Save or apply to a few jobs that list skills to see your gaps.</p>}
              </SectionCard>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <SectionCard title="Discovered vs applied">
                {data.discovery.some(w => w.discovered || w.applied) ? (
                  <div className="h-56" role="img" aria-label={`Jobs discovered and applications per week. Total discovered ${data.discoveredCount}, applied ${data.total}.`}>
                    <ResponsiveContainer>
                      <BarChart data={data.discovery} margin={{ left: -24, right: 4 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="week" tick={AXIS} tickFormatter={w => String(w).slice(5)} /><YAxis allowDecimals={false} tick={AXIS} />
                        <Tooltip contentStyle={TIP} labelFormatter={w => `Week of ${w}`} cursor={{ fill: 'rgba(136,153,187,.1)' }} /><Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar isAnimationActive={false} dataKey="discovered" name="Discovered" fill="#F472B6" radius={[4, 4, 0, 0]} />
                        <Bar isAnimationActive={false} dataKey="applied" name="Applied" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState art="analytics" compact title="Nothing in this period" description="Fetch or add jobs to compare discovery with applications." />}
              </SectionCard>
              <SectionCard title="Match score trend">
                {data.matchTrend.some(w => w.avgMatch != null) ? (
                  <div className="h-56" role="img" aria-label="Average AI match score of jobs analysed each week">
                    <ResponsiveContainer>
                      <LineChart data={data.matchTrend} margin={{ left: -24, right: 8 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="week" tick={AXIS} tickFormatter={w => String(w).slice(5)} /><YAxis domain={[0, 100]} tick={AXIS} />
                        <Tooltip contentStyle={TIP} labelFormatter={w => `Week of ${w}`} formatter={(v, _n, p) => [`${v} (${(p.payload as { matches: number }).matches} jobs)`, 'Average match']} />
                        <Line isAnimationActive={false} type="monotone" dataKey="avgMatch" stroke="#34D399" strokeWidth={2} dot connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState art="analytics" compact title="No match analyses yet" description="Run an AI match on a job to start the trend." />}
              </SectionCard>
            </div>

            <SectionCard title="Monthly progress">
              {data.monthly.length ? (
                <div className="h-56" role="img" aria-label={`Applications, interviews and offers per month: ${data.monthly.map(m => `${m.month} ${m.applications}/${m.interviews}/${m.offers}`).join(', ')}`}>
                  <ResponsiveContainer>
                    <BarChart data={data.monthly} margin={{ left: -24, right: 4 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="month" tick={AXIS} /><YAxis allowDecimals={false} tick={AXIS} />
                      <Tooltip contentStyle={TIP} cursor={{ fill: 'rgba(136,153,187,.1)' }} /><Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar isAnimationActive={false} dataKey="applications" name="Applied" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                      <Bar isAnimationActive={false} dataKey="interviews" name="Interviews" fill="#FBBF24" radius={[4, 4, 0, 0]} />
                      <Bar isAnimationActive={false} dataKey="offers" name="Offers" fill="#34D399" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState art="analytics" compact title="No applications in this period" />}
            </SectionCard>

            <SectionCard title="AI usage" action={<span className="text-xs" style={{ color: 'var(--fg-muted)' }}>last 30 days</span>}>
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 h-56">
                  <p className="text-xs mb-2" style={{ color: 'var(--fg-muted)' }}>Requests per day</p>
                  <ResponsiveContainer>
                    <BarChart data={data.ai.perDay} margin={{ left: -24, right: 4 }}>
                      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="day" tick={AXIS} interval={4} /><YAxis allowDecimals={false} tick={AXIS} />
                      <Tooltip contentStyle={TIP} cursor={{ fill: 'rgba(136,153,187,.1)' }} />
                      <Bar isAnimationActive={false} dataKey="requests" name="Requests" fill="#A78BFA" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs mb-2" style={{ color: 'var(--fg-muted)' }}>Tokens by feature</p>
                  {data.ai.byFeature.length ? (
                    <ul className="space-y-3">
                      {data.ai.byFeature.map(f => (
                        <li key={f.feature}>
                          <div className="flex justify-between text-xs mb-1"><span style={{ color: 'var(--fg-secondary)' }}>{FEATURE_LABEL[f.feature] ?? f.feature}</span><span className="font-mono" style={{ color: 'var(--fg-primary)' }}>{f.tokens.toLocaleString()}</span></div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}><div className="h-full rounded-full" style={{ width: `${(f.tokens / data.ai.byFeature[0]!.tokens) * 100}%`, background: '#A78BFA' }} /></div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm py-8" style={{ color: 'var(--fg-muted)' }}>No AI requests yet.</p>}
                </div>
              </div>
            </SectionCard>
          </>
        )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: string | number; color: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }}><span style={{ color }}><Icon size={16} /></span></div>
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{label}</span>
      </div>
      <p className="font-display font-bold text-2xl" style={{ color: 'var(--fg-primary)' }}>{value}</p>
    </div>
  );
}
