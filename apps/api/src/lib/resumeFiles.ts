import path from 'path';
import { logger } from '../config/logger';

export const RESUME_TYPES = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;
export type ResumeExt = keyof typeof RESUME_TYPES;

/**
 * Works out the real type of an upload from its first bytes, not its name.
 * Returns null unless it is a genuine PDF or DOCX whose extension matches.
 */
export function detectResumeType(buffer: Buffer, originalName: string): ResumeExt | null {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.pdf') {
    // PDFs start with "%PDF-" (some generators put a few junk bytes first; the spec allows 1 KB)
    return buffer.subarray(0, 1024).includes('%PDF-') ? '.pdf' : null;
  }
  if (ext === '.docx') {
    // DOCX is a ZIP ("PK\x03\x04") whose entries include word/document.xml
    const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    return isZip && buffer.includes('word/') ? '.docx' : null;
  }
  return null;
}

/** Extract plain text from a PDF/DOCX. Returns '' if the file can't be read. */
export async function extractResumeText(buffer: Buffer, ext: ResumeExt): Promise<string> {
  try {
    let text = '';
    if (ext === '.pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      text = (await pdfParse(buffer)).text;
    } else {
      const mammoth = await import('mammoth');
      text = (await mammoth.extractRawText({ buffer })).value;
    }
    return text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 60_000);
  } catch (err) {
    logger.warn({ err, ext }, 'Resume text extraction failed');
    return '';
  }
}
