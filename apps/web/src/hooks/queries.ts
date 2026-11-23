import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { apiError } from '@/lib/format';
import { toast } from '@/store/toast.store';
import type { Application, Resume } from '@/lib/types';
import type { AppStatus } from '@/lib/constants';

// ── Shared data hooks ───────────────────────────────────────────────────────

export interface Settings {
  extras: {
    avatar?: string;
    onboardingDone?: boolean;
    jobSources?: string[];
    preferredCompanySize?: string;
    willingToRelocate?: boolean;
    openToContract?: boolean;
    aiModel?: string;
    aiAutoAnalyze?: boolean;
    aiAutoMatch?: boolean;
    aiLanguage?: string;
    linkedinConnected?: boolean;
    githubConnected?: boolean;
    lastJobFetchAt?: string;
  };
  apiKeyPrefix: string | null;
  language?: string;
  aiModels?: Array<{ id: string; label: string }>;
  defaultModel?: string;
  emailJobAlerts?: boolean;
  emailApplicationUpdates?: boolean;
  emailInterviewReminders?: boolean;
  emailWeeklySummary?: boolean;
}

export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/users/settings')).data.data as Settings,
  });

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { extras?: Partial<Settings['extras']> } & Record<string, unknown>) =>
      (await api.put('/users/settings', patch)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
    onError: e => toast.error(apiError(e, 'Could not save settings')),
  });
}

export interface AIUsage {
  totalTokens: number; cost: number; requestCount: number;
  budgetTokens: number; remainingTokens: number; configured: boolean; provider?: string; keyVar?: string;
}
export const useAIUsage = () =>
  useQuery({
    queryKey: ['ai-usage'],
    queryFn: async () => (await api.get('/ai/usage')).data.data as AIUsage,
    staleTime: 30_000,
  });

export const useApplications = (params: Record<string, string | undefined> = {}) =>
  useQuery({
    queryKey: ['applications', params],
    queryFn: async () =>
      (await api.get('/applications', { params })).data.data as { applications: Application[]; total: number },
  });

export const useResumes = () =>
  useQuery({
    queryKey: ['resumes'],
    queryFn: async () => (await api.get('/resumes')).data.data as Resume[],
  });

// ── Mutations with optimistic updates ───────────────────────────────────────

interface AppsData { applications: Application[]; total: number }

/** Applies `fn` to every cached applications list and returns a rollback function. */
function patchApplicationCaches(qc: ReturnType<typeof useQueryClient>, fn: (a: Application[]) => Application[]): () => void {
  const snapshots: Array<[QueryKey, AppsData | undefined]> = qc.getQueriesData<AppsData>({ queryKey: ['applications'] });
  for (const [key, data] of snapshots) {
    if (data && Array.isArray(data.applications)) {
      const applications = fn(data.applications);
      const removed = data.applications.length - applications.length;
      qc.setQueryData<AppsData>(key, { ...data, applications, total: data.total - removed });
    }
  }
  return () => snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
}

const refreshAppData = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['applications'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['analytics'] });
};

export function useUpdateApplicationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppStatus }) => api.put(`/applications/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['applications'] });
      const rollback = patchApplicationCaches(qc, list => list.map(a => (a.id === id ? { ...a, status } : a)));
      return { rollback };
    },
    onError: (e, _v, ctx) => { ctx?.rollback(); toast.error(apiError(e, 'Could not update status')); },
    onSettled: () => refreshAppData(qc),
  });
}

export function useBulkApplications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status?: AppStatus }) => {
      if (status) await api.post('/applications/bulk/status', { ids, status });
      else await api.post('/applications/bulk/delete', { ids });
    },
    onMutate: async ({ ids, status }) => {
      await qc.cancelQueries({ queryKey: ['applications'] });
      const set = new Set(ids);
      const rollback = patchApplicationCaches(qc, list =>
        status ? list.map(a => (set.has(a.id) ? { ...a, status } : a)) : list.filter(a => !set.has(a.id)),
      );
      return { rollback };
    },
    onError: (e, _v, ctx) => { ctx?.rollback(); toast.error(apiError(e, 'Bulk action failed')); },
    onSettled: () => refreshAppData(qc),
  });
}

export function useDeleteApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/applications/${id}`),
    onMutate: async id => {
      await qc.cancelQueries({ queryKey: ['applications'] });
      return { rollback: patchApplicationCaches(qc, list => list.filter(a => a.id !== id)) };
    },
    onSuccess: () => toast.success('Application deleted'),
    onError: (e, _v, ctx) => { ctx?.rollback(); toast.error(apiError(e, 'Could not delete application')); },
    onSettled: () => refreshAppData(qc),
  });
}

export interface NewApplication {
  jobId?: string;
  companyName?: string;
  title?: string;
  applyUrl?: string;
  status?: AppStatus;
  appliedAt?: string;
  notes?: string;
}

export function useCreateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: NewApplication) => (await api.post('/applications', body)).data.data as Application,
    onSuccess: () => { toast.success('Application added'); refreshAppData(qc); qc.invalidateQueries({ queryKey: ['jobs'] }); },
    onError: e => toast.error(apiError(e, 'Could not add application')),
  });
}

export function useToggleSaveJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) => (saved ? api.delete(`/jobs/${id}/save`) : api.post(`/jobs/${id}/save`)),
    onMutate: async ({ id, saved }) => {
      await qc.cancelQueries({ queryKey: ['jobs'] });
      const snaps = qc.getQueriesData<{ pages?: Array<{ jobs: Array<{ id: string; saved: boolean }> }> }>({ queryKey: ['jobs'] });
      for (const [key, data] of snaps) {
        if (!data?.pages) continue;
        qc.setQueryData(key, { ...data, pages: data.pages.map(p => ({ ...p, jobs: p.jobs.map(j => (j.id === id ? { ...j, saved: !saved } : j)) })) });
      }
      return { snaps };
    },
    onSuccess: (_d, v) => toast.success(v.saved ? 'Removed from saved jobs' : 'Job saved'),
    onError: (e, _v, ctx) => { ctx?.snaps.forEach(([k, d]) => qc.setQueryData(k, d)); toast.error(apiError(e, 'Could not update saved job')); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}
