import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Resume } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/format';

interface Preview {
  name: string;
  text: string;
  structured: null | {
    fullName?: string; headline?: string; summary?: string; location?: string; skills: string[];
    experience: Array<{ title: string; company: string; startDate?: string; endDate?: string | null; current?: boolean; description?: string }>;
    education: Array<{ degree: string; field?: string; institution: string }>;
  };
}

/** In-app preview: a styled resume card when AI-parsed data exists, otherwise the extracted text. */
export default function PreviewModal({ resume, onClose }: { resume: Resume | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['resume-preview', resume?.id, resume?.updatedAt],
    enabled: !!resume,
    queryFn: async () => (await api.get(`/resumes/${resume!.id}/preview`)).data.data as Preview,
  });
  const s = data?.structured;

  return (
    <Modal open={!!resume} onClose={onClose} title={resume ? `Preview · ${resume.name}` : 'Preview'} wide>
      {isLoading ? <div className="space-y-3"><Skeleton className="h-8 w-1/2 rounded" /><Skeleton className="h-40 rounded-xl" /></div>
        : !data?.text && !s ? <EmptyState art="resumes" compact title="No readable text" description="We couldn’t extract text from this file. Try a text-based PDF or a DOCX." />
        : (
          <div className="rounded-xl p-6 sm:p-8 mx-auto max-w-2xl" style={{ background: '#fff', color: '#111827', boxShadow: '0 4px 24px rgba(0,0,0,.25)' }}>
            {s ? (
              <div className="space-y-4 text-sm">
                <header>
                  <h2 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{s.fullName || resume?.name}</h2>
                  {s.headline && <p className="text-gray-600">{s.headline}</p>}
                  {s.location && <p className="text-gray-500 text-xs">{s.location}</p>}
                </header>
                {s.summary && <section><h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 border-b pb-1 mb-2">Summary</h3><p>{s.summary}</p></section>}
                {s.skills.length > 0 && <section><h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 border-b pb-1 mb-2">Skills</h3><p>{s.skills.join(' · ')}</p></section>}
                {s.experience.length > 0 && (
                  <section><h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 border-b pb-1 mb-2">Experience</h3>
                    <div className="space-y-3">{s.experience.map((e, i) => (
                      <div key={i}><p className="font-semibold">{e.title} <span className="font-normal text-gray-600">· {e.company}</span></p>
                        <p className="text-xs text-gray-500">{e.startDate ? formatDate(e.startDate, 'MMM yyyy') : ''} – {e.current ? 'Present' : e.endDate ? formatDate(e.endDate, 'MMM yyyy') : ''}</p>
                        {e.description && <p className="mt-1 whitespace-pre-wrap">{e.description}</p>}</div>))}</div></section>
                )}
                {s.education.length > 0 && (
                  <section><h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 border-b pb-1 mb-2">Education</h3>
                    {s.education.map((e, i) => <p key={i}>{e.degree}{e.field ? `, ${e.field}` : ''} <span className="text-gray-600">· {e.institution}</span></p>)}</section>
                )}
              </div>
            ) : <pre className="whitespace-pre-wrap text-sm" style={{ fontFamily: 'inherit' }}>{data?.text}</pre>}
          </div>
        )}
    </Modal>
  );
}
