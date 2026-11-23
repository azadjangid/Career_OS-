import { Worker, Job } from 'bullmq';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import { prisma } from '../prisma';
import { getConnectionOptions } from '../redis';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

interface ResumeParsePayload {
  resumeId: string;
  userId: string;
}

const openai = new OpenAI({ apiKey: process.env.AI_API_KEY });

async function extractText(filePath: string, mimeType: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);

  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (mimeType.includes('word') || filePath.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  return buffer.toString('utf-8');
}

export const resumeParseWorker = new Worker<ResumeParsePayload>(
  'resume-parse',
  async (job: Job<ResumeParsePayload>) => {
    const { resumeId, userId } = job.data;

    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
    if (!resume) {
      logger.warn({ resumeId }, 'Resume not found');
      return;
    }

    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), '..', 'api', 'uploads');
    const filePath = path.join(uploadsDir, resume.filePath || '');

    if (!fs.existsSync(filePath)) {
      logger.warn({ filePath }, 'Resume file not found on disk');
      return;
    }

    const text = await extractText(filePath, resume.mimeType || 'application/pdf');

    const prompt = `
Analyze this resume and return a JSON object with:
- atsScore (0-100): ATS compatibility score
- strengths (string[]): top 3 strengths
- weaknesses (string[]): top 3 areas to improve
- keywords (string[]): important keywords found
- extractedSkills (string[]): technical skills detected
- suggestions (string[]): specific improvement tips

Resume text:
${text.substring(0, 4000)}

Return only valid JSON.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 600,
    });

    const analysis = JSON.parse(response.choices[0].message.content || '{}');

    await prisma.resume.update({
      where: { id: resumeId },
      data: {
        atsScore: analysis.atsScore || 0,
        keywords: analysis.keywords || [],
        extractedSkills: analysis.extractedSkills || [],
        aiAnalysis: analysis,
      },
    });

    // Track AI usage
    await prisma.aIUsage.create({
      data: {
        userId,
        feature: 'resume_analysis',
        model: 'gpt-4o-mini',
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
        cost: ((response.usage?.total_tokens || 0) / 1000) * 0.00015,
        metadata: { resumeId },
      },
    });

    logger.info({ resumeId, atsScore: analysis.atsScore }, 'Resume parsed');
    return { atsScore: analysis.atsScore };
  },
  {
    ...getConnectionOptions(),
    concurrency: 3,
  }
);
