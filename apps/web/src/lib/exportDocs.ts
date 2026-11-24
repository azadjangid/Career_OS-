import { downloadBlob } from './format';

const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'document';

export const downloadTxt = (title: string, text: string) => downloadBlob(`${safeName(title)}.txt`, text, 'text/plain;charset=utf-8');

/** Real .docx via the `docx` library (loaded on demand to keep the main bundle small). */
export async function downloadDocx(title: string, text: string): Promise<void> {
  const { Document, Packer, Paragraph, TextRun } = await import('docx');
  const doc = new Document({
    sections: [{
      children: text.split(/\n/).map(line => new Paragraph({ children: [new TextRun({ text: line, font: 'Calibri', size: 22 })], spacing: { after: line.trim() ? 120 : 60 } })),
    }],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(`${safeName(title)}.docx`, blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

export interface PdfSection { heading?: string; lines: string[] }

/** Simple text PDF with wrapping and page breaks (jsPDF, loaded on demand). */
export async function downloadPdf(title: string, sections: PdfSection[], filename = title): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;

  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const write = (text: string, size: number, bold = false, gap = 4) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    for (const line of doc.splitTextToSize(text, W - M * 2) as string[]) {
      ensure(size + gap);
      doc.text(line, M, y + size);
      y += size + gap;
    }
  };

  write(title, 18, true, 8);
  y += 6;
  for (const s of sections) {
    if (s.heading) { y += 6; write(s.heading, 13, true, 6); }
    for (const l of s.lines) write(l, 10.5, false, 3);
  }
  doc.save(`${safeName(filename)}.pdf`);
}

export type ResumeTemplate = 'classic' | 'modern' | 'compact';
export const RESUME_TEMPLATES: Array<{ id: ResumeTemplate; label: string; hint: string }> = [
  { id: 'classic', label: 'Classic', hint: 'Serif headings, centred name. Safe for every ATS.' },
  { id: 'modern', label: 'Modern', hint: 'Sans-serif with an accent rule under each heading.' },
  { id: 'compact', label: 'Compact', hint: 'Smaller type and spacing to fit more on one page.' },
];

const HEADING = /^(summary|professional summary|profile|about me|objective|career objective|experience|work experience|professional experience|employment history|work history|projects|personal projects|key projects|skills|technical skills|core skills|key skills|technologies|education|certifications|achievements|awards|publications|languages|interests|volunteering)\s*:?$/i;

/** Splits plain resume text into a header block (name, contact) and titled sections. */
export function splitResume(text: string): { header: string[]; sections: Array<{ heading: string; lines: string[] }> } {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trimEnd());
  const header: string[] = [];
  const sections: Array<{ heading: string; lines: string[] }> = [];
  for (const raw of lines) {
    const l = raw.trim();
    const isHeading = l.length > 0 && l.length <= 40 && (HEADING.test(l) || (/^[A-Z][A-Z &/]{3,}$/.test(l) && !/\d/.test(l)));
    if (isHeading) sections.push({ heading: l.replace(/:$/, ''), lines: [] });
    else if (sections.length) sections[sections.length - 1]!.lines.push(l);
    else if (l) header.push(l);
  }
  return { header, sections };
}

/** Text-based (ATS-readable) resume PDF in one of three templates. */
export async function downloadResumePdf(name: string, text: string, template: ResumeTemplate = 'classic'): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const t = {
    classic: { font: 'times', body: 11, head: 12.5, name: 20, gap: 3.5, M: 54, accent: [40, 40, 40] as const, center: true },
    modern: { font: 'helvetica', body: 10.5, head: 12, name: 22, gap: 3.5, M: 48, accent: [234, 88, 12] as const, center: false },
    compact: { font: 'helvetica', body: 9.5, head: 11, name: 17, gap: 2.2, M: 36, accent: [60, 60, 60] as const, center: false },
  }[template];
  const M = t.M;
  let y = M;
  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const write = (s: string, size: number, opts: { bold?: boolean; gap?: number; center?: boolean; indent?: number } = {}) => {
    doc.setFont(t.font, opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const indent = opts.indent ?? 0;
    for (const line of doc.splitTextToSize(s, W - M * 2 - indent) as string[]) {
      ensure(size + (opts.gap ?? t.gap));
      if (opts.center) doc.text(line, W / 2, y + size, { align: 'center' });
      else doc.text(line, M + indent, y + size);
      y += size + (opts.gap ?? t.gap);
    }
  };

  const { header, sections } = splitResume(text);
  const [first, ...contact] = header.length ? header : [name];
  doc.setTextColor(20, 20, 20);
  write(first ?? name, t.name, { bold: true, gap: 6, center: t.center });
  if (contact.length) {
    doc.setTextColor(80, 80, 80);
    write(contact.join('  ·  '), t.body - 0.5, { center: t.center });
    doc.setTextColor(20, 20, 20);
  }
  for (const s of sections) {
    y += t.head * 0.8;
    ensure(t.head * 2.5);
    doc.setTextColor(t.accent[0], t.accent[1], t.accent[2]);
    write(template === 'classic' ? s.heading.toUpperCase() : s.heading, t.head, { bold: true, gap: 3 });
    doc.setDrawColor(t.accent[0], t.accent[1], t.accent[2]);
    doc.setLineWidth(template === 'modern' ? 1.2 : 0.5);
    doc.line(M, y, W - M, y);
    y += 5;
    doc.setTextColor(20, 20, 20);
    for (const l of s.lines) {
      if (!l) { y += t.gap; continue; }
      const bullet = /^[•▪●◦‣\-*–]\s+/.test(l);
      if (bullet) {
        ensure(t.body + t.gap);
        doc.setFont(t.font, 'normal');
        doc.setFontSize(t.body);
        doc.text('•', M + 4, y + t.body);
        write(l.replace(/^[•▪●◦‣\-*–]\s+/, ''), t.body, { indent: 14 });
      } else write(l, t.body);
    }
  }
  doc.save(`${safeName(name)}.pdf`);
}
