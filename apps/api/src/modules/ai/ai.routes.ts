import { Router } from 'express';
import { aiController as c } from './ai.controller';
import { authenticate } from '../../middleware/auth';
import { aiRateLimit } from '../../middleware/rateLimiter';

const router = Router();
router.use(authenticate);

// Usage is read-only and shown in the sidebar on every page, so it bypasses the AI rate limiter
router.get('/usage', c.getUsage);
router.get('/health', c.health);

router.use(aiRateLimit);
router.post('/test-connection', c.testConnection);
router.post('/chat', c.chat);
router.post('/chat/stream', c.chatStream);
router.post('/chat/resolve', c.resolveAction);
router.post('/resume-analysis', c.analyzeResume);
router.post('/resume-tailor', c.tailorResume);
router.post('/job-match', c.analyzeJobMatch);
router.post('/cover-letter', c.generateCoverLetter);
router.post('/interview-questions', c.generateInterviewQuestions);
router.post('/career/:task', c.careerTask);
router.get('/conversations', c.listConversations);
router.get('/conversations/:id', c.getConversation);
router.delete('/conversations/:id', c.deleteConversation);

export default router;
