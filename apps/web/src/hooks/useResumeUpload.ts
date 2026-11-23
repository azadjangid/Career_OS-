import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { apiError } from '@/lib/format';
import { toast } from '@/store/toast.store';
import type { Resume } from '@/lib/types';

export const MAX_RESUME_MB = 10;
const ALLOWED = ['.pdf', '.doc', '.docx'];

interface Options {
  /**
   * After uploading, read the resume with AI and fill the profile (headline, skills, experience…).
   * Only empty profile fields are filled; existing edits are never overwritten.
   * Onboarding turns this off because it runs the parse itself to show the result.
   */
  autoFillProfile?: boolean;
}

/** Validates and uploads a resume file. Returns the created resume, or null after showing an error toast. */
export function useResumeUpload({ autoFillProfile = true }: Options = {}) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [filling, setFilling] = useState(false);

  const fillProfile = async (resumeId: string) => {
    setFilling(true);
    try {
      await api.post(`/resumes/${resumeId}/parse`, { applyToProfile: true });
      toast.success('Profile filled from your resume');
      for (const key of ['profile', 'dashboard', 'resumes', 'jobs']) qc.invalidateQueries({ queryKey: [key] });
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      // Upload itself succeeded, so these are informational rather than errors
      if (status === 503) toast.info('Resume saved. Add an AI key in .env to auto-fill your profile from it.');
      else if (status === 422) toast.info('Resume saved, but no text could be read from it. Try a text-based PDF or DOCX.');
      else toast.info(`Resume saved, but the profile wasn’t filled: ${apiError(e, 'AI request failed')}`);
    } finally {
      setFilling(false);
    }
  };

  const upload = async (file: File, name?: string): Promise<(Resume & { hasText?: boolean }) | null> => {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED.includes(ext)) { toast.error('Please upload a PDF or DOCX file'); return null; }
    if (file.size > MAX_RESUME_MB * 1024 * 1024) { toast.error(`File is larger than ${MAX_RESUME_MB} MB`); return null; }

    setUploading(true);
    let resume: (Resume & { hasText?: boolean }) | null = null;
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', name ?? file.name.replace(/\.[^.]+$/, ''));
      const res = await api.post('/resumes', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries({ queryKey: ['resumes'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Resume uploaded');
      resume = res.data.data as Resume & { hasText?: boolean };
    } catch (e) {
      toast.error(apiError(e, 'Upload failed'));
      return null;
    } finally {
      setUploading(false);
    }

    if (autoFillProfile && resume.hasText !== false) await fillProfile(resume.id);
    return resume;
  };

  return { upload, uploading, filling };
}
