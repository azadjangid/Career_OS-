import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../config/logger';

/** Extract plain text from an uploaded PDF/DOCX. Returns '' if the file can't be read. */
export async function extractResumeText(storageKey: string, originalName: string): Promise<string> {
  const filePath = path.resolve(env.STORAGE_LOCAL_PATH, storageKey);
  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(originalName).toLowerCase();
    let text = '';
    if (ext === '.pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      text = (await pdfParse(buffer)).text;
    } else if (ext === '.docx') {
      const mammoth = await import('mammoth');
      text = (await mammoth.extractRawText({ buffer })).value;
    }
    return text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 60_000);
  } catch (err) {
    logger.warn({ err, originalName }, 'Resume text extraction failed');
    return '';
  }
}
