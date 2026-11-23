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
