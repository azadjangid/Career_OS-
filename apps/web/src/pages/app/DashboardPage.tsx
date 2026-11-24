import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Briefcase, FileText, TrendingUp, Send, Target, ChevronRight, Quote, UserCircle2, CalendarClock, Award, Lightbulb, Activity, Video } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { useOnboarding } from '@/hooks/useOnboarding';
import { MINI_BOARD, STATUS_LABEL, type AppStatus } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { CompanyLogo, StatusBadge, MatchBadge, ScoreRing, SectionCard } from '@/components/ui/Bits';
import { CardSkeleton, Skeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

interface DashboardData {
  kpis: { totalJobs: number; totalApplications: number; totalResumes: number; responseRate: number; interviewing: number; offers: number; rejections: number; bestAts: number | null; appliedThisWeek: number };
  upcomingInterviews: Array<{ id: string; type: string; scheduledAt: string | null; meetingUrl: string | null; location: string | null; applicationId: string | null; title: string; company: string }>;
  activity: Array<{ id: string; applicationId: string; at: string; from: AppStatus | null; to: AppStatus; title: string; company: string }>;
  weekly: Array<{ week: string; applications: number; responses: number }>;
  monthly: Array<{ month: string; applications: number; interviews: number; offers: number }>;
  marketInsights: { jobs: number; topSkills: Array<{ skill: string; count: number; youHave: boolean }>; remoteShare: number; indiaEligibleRemote: number };
  recommendations: Array<{ id: string; title: string; detail: string; link: string }>;
  applicationsByStatus: Array<{ status: AppStatus; _count: { status: number } }>;
  recentApplications: Array<{ id: string; status: AppStatus; appliedAt?: string; updatedAt: string; matchScore: number | null; job: { title: string; companyName: string; logo: string | null } }>;
  health: { score: number; components: Array<{ key: string; label: string; score: number; hint: string }> };
  goals: Array<{ id: string; title: string; progress: number; target: number; link: string }>;
  profile: { percent: number; missing: string[] };
}

// One quote per day, rotating through the list by day-of-year
const QUOTES: Array<[string, string]> = [
  ['The only way to do great work is to love what you do.', 'Steve Jobs'],
  ['Opportunities don’t happen. You create them.', 'Chris Grosser'],
  ['Success is the sum of small efforts repeated day in and day out.', 'Robert Collier'],
  ['Don’t watch the clock; do what it does. Keep going.', 'Sam Levenson'],
  ['The future depends on what you do today.', 'Mahatma Gandhi'],
  ['Well begun is half done.', 'Aristotle'],
  ['It always seems impossible until it’s done.', 'Nelson Mandela'],
  ['Your career is a marathon, not a sprint.', 'Unknown'],
  ['Fall seven times, stand up eight.', 'Japanese proverb'],
  ['Action is the foundational key to all success.', 'Pablo Picasso'],
  ['Quality is not an act, it is a habit.', 'Aristotle'],
  ['Great things are done by a series of small things brought together.', 'Vincent van Gogh'],
  ['What you do today can improve all your tomorrows.', 'Ralph Marston'],
  ['Hard work beats talent when talent doesn’t work hard.', 'Tim Notke'],
];
const AXIS = { fill: '#878BB0', fontSize: 11 };
const GRID = 'rgba(136,153,187,.18)';
const TIP = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--fg-primary)' };
const dayOfYear = () => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { setQuickAction } = useUIStore();
  const { state: onboarding } = useOnboarding();
  const quote = useMemo(() => QUOTES[dayOfYear() % QUOTES.length]!, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/analytics/dashboard')).data.data as DashboardData,
  });

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    data?.applicationsByStatus.forEach(s => m.set(s.status, s._count.status));
    return m;
  }, [data]);

  if (isError && !data) {
    return <EmptyState art="applications" title="Couldn’t load your dashboard" description="Check your connection and try again." action={<button className="btn-primary" onClick={() => refetch()}>Try again</button>} />;
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading dashboard">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <div className="grid lg:grid-cols-2 gap-6"><CardSkeleton lines={4} /><CardSkeleton lines={4} /></div>
      </div>
    );
  }

  const showBanner = data.profile.percent < 100 && onboarding !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl" style={{ color: 'var(--fg-primary)' }}>Good {greeting()}, {firstName}! 👋</h1>
        <p className="text-sm mt-2 flex items-start gap-2" style={{ color: 'var(--fg-secondary)' }}>
          <Quote size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden />
          <span><em>{quote[0]}</em> <span style={{ color: 'var(--fg-muted)' }}>— {quote[1]}</span></span>
        </p>
      </div>

      {showBanner && (
        <div className="card flex flex-col sm:flex-row sm:items-center gap-4" style={{ borderColor: 'var(--border-accent)' }}>
          <UserCircle2 size={28} style={{ color: 'var(--accent)' }} className="shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm" style={{ color: 'var(--fg-primary)' }}>Complete your profile — {data.profile.percent}% done</p>
            <div className="h-2 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--bg-hover)' }} role="progressbar" aria-valuenow={data.profile.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion">
              <div className="h-full rounded-full transition-all" style={{ width: `${data.profile.percent}%`, background: 'var(--accent)' }} />
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--fg-muted)' }}>Next: {data.profile.missing.slice(0, 2).join(' · ')}</p>
          </div>
          <Link to={onboarding === 'skipped' ? '/onboarding' : '/profile'} className="btn-primary text-sm py-2 justify-center">Finish setup</Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Briefcase} label="Jobs found" value={data.kpis.totalJobs} color="#60A5FA" />
        <Kpi icon={Send} label="Applications" value={data.kpis.totalApplications} color="var(--accent)" />
        <Kpi icon={FileText} label="Resumes" value={data.kpis.totalResumes} color="#34D399" />
        <Kpi icon={TrendingUp} label="Response rate" value={`${data.kpis.responseRate}%`} color="#A78BFA" />
        <Kpi icon={CalendarClock} label="Interviewing now" value={data.kpis.interviewing} color="#FBBF24" />
        <Kpi icon={Award} label="Offers vs rejections" value={`${data.kpis.offers} / ${data.kpis.rejections}`} color="#34D399" />
        <Kpi icon={Send} label="Applied this week" value={data.kpis.appliedThisWeek} color="#60A5FA" />
        <Kpi icon={FileText} label="Best ATS score" value={data.kpis.bestAts ?? '–'} color="#F472B6" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Recommended next steps">
          {data.recommendations.length ? (
            <ul className="space-y-2">
              {data.recommendations.map(r => (
                <li key={r.id}>
                  <Link to={r.link} className="flex items-start gap-3 p-3 rounded-lg card-hover" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <Lightbulb size={17} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{r.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>{r.detail}</p>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--fg-muted)' }} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState art="applications" compact title="You’re on top of things" description="Nothing urgent right now. Fetch new jobs or practise for interviews." />}
        </SectionCard>

        <SectionCard title="Upcoming interviews" action={<Link to="/applications" className="text-sm" style={{ color: 'var(--accent)' }}>All applications</Link>}>
          {data.upcomingInterviews.length ? (
            <ul className="space-y-2">
              {data.upcomingInterviews.map(i => (
                <li key={i.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                  <CalendarClock size={18} style={{ color: 'var(--tone-amber)' }} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--fg-primary)' }}>{i.title}{i.company ? ` · ${i.company}` : ''}</p>
                    <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{i.scheduledAt ? formatDate(i.scheduledAt, 'EEE d MMM, HH:mm') : 'Time not set'} · {i.type.charAt(0) + i.type.slice(1).toLowerCase().replace(/_/g, ' ')}{i.location ? ` · ${i.location}` : ''}</p>
                  </div>
                  {i.meetingUrl && <a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost p-1.5" aria-label={`Join ${i.title} interview`}><Video size={16} /></a>}
                  {i.applicationId && <Link to={`/applications?open=${i.applicationId}`} className="btn-ghost p-1.5" aria-label={`Open application for ${i.title}`}><ChevronRight size={16} /></Link>}
                </li>
              ))}
            </ul>
          ) : <EmptyState art="applications" compact title="No interviews scheduled" description="Add an interview from an application to see it here and get a reminder." />}
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Weekly activity">
          {data.weekly.some(w => w.applications) ? (
            <div style={{ height: 200 }} role="img" aria-label={`Applications per week for the last 8 weeks: ${data.weekly.map(w => w.applications).join(', ')}`}>
              <ResponsiveContainer>
                <BarChart data={data.weekly} margin={{ left: -24, right: 4 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="week" tick={AXIS} tickFormatter={w => String(w).slice(5)} /><YAxis allowDecimals={false} tick={AXIS} />
                  <Tooltip contentStyle={TIP} labelFormatter={w => `Week of ${w}`} cursor={{ fill: 'rgba(136,153,187,.1)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar isAnimationActive={false} dataKey="applications" name="Applied" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="responses" name="Got a reply" fill="#34D399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState art="applications" compact title="No applications in the last 8 weeks" description="Your weekly applications and replies will be charted here." />}
        </SectionCard>

        <SectionCard title="Monthly progress" action={<Link to="/analytics" className="text-sm" style={{ color: 'var(--accent)' }}>Analytics</Link>}>
          {data.monthly.some(m => m.applications) ? (
            <div style={{ height: 200 }} role="img" aria-label={`Applications per month for the last 6 months: ${data.monthly.map(m => m.applications).join(', ')}`}>
              <ResponsiveContainer>
                <BarChart data={data.monthly} margin={{ left: -24, right: 4 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" tick={AXIS} tickFormatter={m => new Date(`${m}-01T00:00:00`).toLocaleString(undefined, { month: 'short' })} /><YAxis allowDecimals={false} tick={AXIS} />
                  <Tooltip contentStyle={TIP} cursor={{ fill: 'rgba(136,153,187,.1)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar isAnimationActive={false} dataKey="applications" name="Applied" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="interviews" name="Interviewing" fill="#FBBF24" radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="offers" name="Offers" fill="#34D399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState art="applications" compact title="No monthly data yet" description="Applications, interviews and offers per month will appear here." />}
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Market insights" action={<span className="text-xs" style={{ color: 'var(--fg-muted)' }}>From your {data.marketInsights.jobs} jobs added in the last 30 days</span>}>
          {data.marketInsights.topSkills.length ? (
            <>
              <p className="text-xs mb-3" style={{ color: 'var(--fg-secondary)' }}>
                {data.marketInsights.remoteShare}% remote · {data.marketInsights.indiaEligibleRemote} remote jobs open to India
              </p>
              <ul className="space-y-1.5">
                {data.marketInsights.topSkills.map(t => {
                  const max = data.marketInsights.topSkills[0]!.count;
                  return (
                    <li key={t.skill} className="flex items-center gap-2 text-xs">
                      <span className="w-28 truncate" style={{ color: 'var(--fg-primary)' }}>{t.skill}</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(t.count / max) * 100}%`, background: t.youHave ? 'var(--tone-green)' : 'var(--tone-amber)' }} />
                      </div>
                      <span className="w-14 text-right font-mono" style={{ color: 'var(--fg-muted)' }}>{t.count} jobs</span>
                      <span className={`badge ${t.youHave ? 'badge-green' : 'badge-amber'}`}>{t.youHave ? 'You have it' : 'Gap'}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : <EmptyState art="search" compact title="No recent jobs to analyse" description="Fetch jobs on the Jobs page to see which skills employers ask for." action={<Link to="/jobs" className="btn-secondary text-sm py-2">Go to jobs</Link>} />}
        </SectionCard>

        <SectionCard title="Recent activity">
          {data.activity.length ? (
            <ul className="space-y-2">
              {data.activity.map(a => (
                <li key={a.id}>
                  <Link to={`/applications?open=${a.applicationId}`} className="flex items-center gap-3 py-1.5 text-sm rounded-lg hover:bg-[var(--bg-hover)] -mx-2 px-2">
                    <Activity size={15} style={{ color: 'var(--accent)' }} aria-hidden />
                    <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--fg-secondary)' }}>
                      <span style={{ color: 'var(--fg-primary)' }}>{a.title}</span> at {a.company}: {a.from ? `${STATUS_LABEL[a.from]} → ` : ''}{STATUS_LABEL[a.to]}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: 'var(--fg-muted)' }}>{formatDate(a.at, 'd MMM')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState art="applications" compact title="No activity yet" description="Status changes on your applications will show up here." />}
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Career Health Score">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <ScoreRing score={data.health.score} label="/ 100" />
            <ul className="flex-1 w-full space-y-3">
              {data.health.components.map(c => (
                <li key={c.key} title={c.hint}>
                  <div className="flex justify-between text-xs mb-1"><span style={{ color: 'var(--fg-secondary)' }}>{c.label}</span><span className="font-mono" style={{ color: 'var(--fg-primary)' }}>{c.score}</span></div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}><div className="h-full rounded-full" style={{ width: `${c.score}%`, background: 'var(--accent)' }} /></div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--fg-muted)' }}>{c.hint}</p>
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="This Week’s Goals">
          <ul className="space-y-3">
            {data.goals.map(g => {
              const pct = Math.min(100, Math.round((g.progress / Math.max(g.target, 1)) * 100));
              return (
                <li key={g.id}>
                  <Link to={g.link} className="flex items-center gap-3 p-3 rounded-lg card-hover" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <Target size={18} style={{ color: pct >= 100 ? 'var(--tone-green)' : 'var(--accent)' }} aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{g.title}</p>
                      <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--bg-hover)' }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--tone-green)' : 'var(--accent)' }} /></div>
                    </div>
                    <span className="text-xs font-mono" style={{ color: 'var(--fg-muted)' }}>{g.progress}/{g.target}</span>
                    <ChevronRight size={16} style={{ color: 'var(--fg-muted)' }} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Application Pipeline" action={<Link to="/applications" className="text-sm" style={{ color: 'var(--accent)' }}>Open board</Link>}>
        {data.kpis.totalApplications === 0 ? (
          <EmptyState art="applications" compact title="No applications yet" description="Add your first application to see it move through the pipeline."
            action={<><button className="btn-primary text-sm py-2" onClick={() => setQuickAction('application')}>Add application</button><Link to="/jobs" className="btn-secondary text-sm py-2">Browse jobs</Link></>} />
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x" role="list">
            {MINI_BOARD.map(col => {
              const n = col.statuses.reduce((s, st) => s + (counts.get(st) ?? 0), 0);
              return (
                <Link key={col.key} to={`/applications`} role="listitem" className="snap-start shrink-0 w-40 rounded-xl p-3 card-hover" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: 'var(--fg-secondary)' }}>{col.label}</span>
                    <span className="min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-bold flex items-center justify-center text-white" style={{ background: col.color }}>{n}</span>
                  </div>
                  <div className="h-1 rounded-full mt-3" style={{ background: col.color, opacity: n ? 1 : 0.25 }} />
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent Applications" action={<Link to="/applications" className="text-sm" style={{ color: 'var(--accent)' }}>View all</Link>}>
        {data.recentApplications.length ? (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {data.recentApplications.map(a => (
              <li key={a.id}>
                <Link to={`/applications?open=${a.id}`} className="flex items-center gap-3 py-3 -mx-2 px-2 rounded-lg hover:bg-[var(--bg-hover)]">
                  <CompanyLogo name={a.job.companyName} logo={a.job.logo} size={38} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--fg-primary)' }}>{a.job.title}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--fg-secondary)' }}>{a.job.companyName} · {formatDate(a.appliedAt ?? a.updatedAt, 'd MMM')}</p>
                  </div>
                  {a.matchScore != null && <span className="hidden sm:inline"><MatchBadge score={a.matchScore} /></span>}
                  <StatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : <EmptyState art="applications" compact title="No recent activity" description="Applications you add or update will show up here." />}
      </SectionCard>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number | string; color: string }) {
  return (
    <div className="card card-hover" style={{ padding: 16 }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--fg-muted)' }}>{label}</p>
          <p className="font-display font-bold text-2xl" style={{ color: 'var(--fg-primary)' }}>{value}</p>
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
          <span style={{ color }}><Icon size={18} /></span>
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
